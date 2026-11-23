"""zy-project-board backend — FastAPI + SQLAlchemy + SQLite.

Run:  uvicorn app.main:app --port 8001
Auth:  writes require header ``X-API-Key`` matching env ``API_KEY``
       (default ``dev-api-key-change-me``) OR a JWT from /api/auth/login
       as ``Authorization: Bearer <token>``; GETs are public.
       JWT secret comes from env ``SECRET_KEY`` (dev fallback only).
"""
import json
import os
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

import bcrypt
import jwt
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db, init_db, SessionLocal
from app.models import Account, Comment, DirectoryUser, Ticket
from app.schemas import (
    AuthLogin,
    AuthOut,
    AuthRegister,
    AuthUserOut,
    BoardColumn,
    BoardOut,
    ChangePassword,
    CommentCreate,
    CommentOut,
    ProjectOut,
    TicketCreate,
    TicketOut,
    TicketUpdate,
    TokenPoint,
    TokenStatsOut,
    UpdateMe,
    UploadOut,
    UserOut,
    UserSyncError,
    UserSyncIn,
    UserSyncOut,
)
from app.seed import (
    PROJECTS,
    USER_NAMES,
    seed_demo_account,
    seed_directory_users,
    seed_if_empty,
)

API_KEY = os.environ.get("API_KEY", "dev-api-key-change-me")
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 7

STATUSES = ["backlog", "todo", "in_progress", "review", "done"]
STATUS_LABELS = {
    "backlog": "积压",
    "todo": "要做的事",
    "in_progress": "进行中",
    "review": "评论",
    "done": "完成",
}
PRIORITIES = ["low", "medium", "high", "urgent"]
PREFIXES = ["DS", "FE", "BE"]

# Token-stats base curve (Sep 1-16, 2026), in tokens. Sums to 12,100,000
# for ticket id 1; other tickets scale deterministically by ticket id.
TOKEN_BASE = [
    520000, 560000, 590000, 620000, 650000, 690000, 720000, 750000,
    780000, 810000, 840000, 860000, 880000, 900000, 930000, 1000000,
]

# Image uploads: stored under backend/data/uploads/. In Docker this is
# /app/data/uploads, inside the ./backend/data volume — so rebuilding the
# image or recreating the container never loses uploaded files. Never
# store uploads in /tmp or in the image layer. UPLOAD_DIR can be
# overridden (smoke tests use a temp dir).
UPLOAD_DIR = Path(
    os.environ.get("UPLOAD_DIR", "")
    or (Path(__file__).resolve().parent.parent / "data" / "uploads")
)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_if_empty(db)
        seed_directory_users(db)
        seed_demo_account(db)
    finally:
        db.close()
    yield


app = FastAPI(title="zy-project-board API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images at /uploads/<uuid>.<ext> (files live in
# UPLOAD_DIR, inside the persistent volume — see above).
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def require_api_key(x_api_key: str | None = Header(default=None)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="invalid api key")
    return x_api_key


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _check_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _make_token(account: Account) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": str(account.id),
        "email": account.email,
        "iat": now,
        "exp": now + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def _account_out(a: Account) -> AuthUserOut:
    return AuthUserOut(id=a.id, name=a.name, email=a.email, created_at=a.created_at)


def get_current_account(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Account:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization[len("Bearer "):].strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        account_id = int(payload.get("sub", ""))
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="invalid token")
    account = db.query(Account).filter(Account.id == account_id).first()
    if account is None:
        raise HTTPException(status_code=401, detail="invalid token")
    return account


def require_write_auth(
    x_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Writes accept either the X-API-Key (MCP / scripts) or a JWT."""
    if x_api_key is not None and x_api_key == API_KEY:
        return {"type": "api_key"}
    if authorization and authorization.startswith("Bearer "):
        try:
            get_current_account(authorization, db)
        except HTTPException:
            raise HTTPException(status_code=401, detail="invalid token")
        return {"type": "jwt"}
    raise HTTPException(status_code=401, detail="invalid api key or token")


def _jwt_account_or_none(
    authorization: str | None,
    db: Session,
) -> Account | None:
    """Return the logged-in account when a valid Bearer JWT is present.

    Used by endpoints that behave differently for a logged-in user vs an
    API-Key caller (e.g. comment authorship). Returns None when there is
    no Bearer token or the token is invalid.
    """
    if authorization and authorization.startswith("Bearer "):
        try:
            return get_current_account(authorization, db)
        except HTTPException:
            return None
    return None


def user_out(u: DirectoryUser) -> UserOut:
    return UserOut(
        id=u.id,
        name=u.name,
        initials=u.initials,
        color=u.color,
        avatar_url=u.avatar_url or "",
        email=u.email or "",
        role=u.role or "",
        source=u.source,
        external_id=u.external_id or "",
        active=bool(u.active),
        synced_at=u.synced_at,
    )


def _user_display_name(db: Session, user_id: str) -> str:
    row = db.query(DirectoryUser).filter(DirectoryUser.id == user_id).first()
    if row is not None:
        return row.name
    return USER_NAMES.get(user_id, user_id)


def ticket_out(t: Ticket) -> TicketOut:
    return TicketOut(
        id=t.id,
        code=t.code,
        category=t.category or "",
        title=t.title,
        description=t.description,
        status=t.status,
        priority=t.priority,
        project_id=t.project_id,
        assignee_ids=json.loads(t.assignee_ids or "[]"),
        created_at=t.created_at,
        updated_at=t.updated_at,
        completed_at=t.completed_at,
        position=t.position,
    )


def get_ticket_or_404(db: Session, ticket_id: int) -> Ticket:
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if t is None:
        raise HTTPException(status_code=404, detail="ticket not found")
    return t


def next_code(db: Session, prefix: str) -> str:
    """prefix + '-' + (max numeric suffix for that prefix + 1)."""
    max_suffix = 0
    for (code,) in db.query(Ticket.code).filter(Ticket.code.like(f"{prefix}-%")).all():
        try:
            n = int(code.split("-", 1)[1])
        except (IndexError, ValueError):
            continue
        max_suffix = max(max_suffix, n)
    return f"{prefix}-{max_suffix + 1}"


def end_position(db: Session, status: str) -> int:
    m = db.query(func.max(Ticket.position)).filter(Ticket.status == status).scalar()
    return (m + 1) if m is not None else 0


@app.get("/health")
def health():
    return {"status": "ok"}


# ---- Auth: register / login / me / update name / change password ----

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@app.post("/api/auth/register", response_model=AuthOut, status_code=201)
def register(payload: AuthRegister, db: Session = Depends(get_db)):
    name = (payload.name or "").strip()
    email = (payload.email or "").strip().lower()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="invalid email")
    if len(payload.password or "") < 6:
        raise HTTPException(status_code=422, detail="password must be at least 6 characters")
    if db.query(Account).filter(Account.email == email).first() is not None:
        raise HTTPException(status_code=400, detail="email already registered")
    account = Account(
        name=name,
        email=email,
        password_hash=_hash_password(payload.password),
        created_at=datetime.utcnow(),
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return AuthOut(token=_make_token(account), user=_account_out(account))


@app.post("/api/auth/login", response_model=AuthOut)
def login(payload: AuthLogin, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    account = db.query(Account).filter(Account.email == email).first()
    if account is None or not _check_password(payload.password or "", account.password_hash):
        raise HTTPException(status_code=401, detail="invalid email or password")
    return AuthOut(token=_make_token(account), user=_account_out(account))


@app.get("/api/auth/me", response_model=AuthUserOut)
def me(account: Account = Depends(get_current_account)):
    return _account_out(account)


@app.patch("/api/auth/me", response_model=AuthUserOut)
def update_me(
    payload: UpdateMe,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    if len(name) > 100:
        raise HTTPException(status_code=422, detail="name is too long")
    account.name = name
    db.commit()
    db.refresh(account)
    return _account_out(account)


@app.post("/api/auth/change-password")
def change_password(
    payload: ChangePassword,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    if not _check_password(payload.current_password or "", account.password_hash):
        raise HTTPException(status_code=401, detail="current password is incorrect")
    if len(payload.new_password or "") < 6:
        raise HTTPException(status_code=422, detail="new password must be at least 6 characters")
    account.password_hash = _hash_password(payload.new_password)
    db.commit()
    return {"ok": True}


@app.get("/api/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    source: str | None = Query(default=None),
    active: bool | None = Query(default=None),
):
    query = db.query(DirectoryUser).order_by(DirectoryUser.sort_order, DirectoryUser.id)
    if source:
        query = query.filter(DirectoryUser.source == source)
    if active is not None:
        query = query.filter(DirectoryUser.active == active)
    return [user_out(u) for u in query.all()]


@app.get("/api/users/{user_id}", response_model=UserOut)
def get_user(user_id: str, db: Session = Depends(get_db)):
    u = db.query(DirectoryUser).filter(DirectoryUser.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404, detail="user not found")
    return user_out(u)


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    _auth=Depends(require_write_auth),
):
    """Remove a directory user (seed or synced). Ticket assignments that
    reference the id keep the id and render a fallback in the UI."""
    u = db.query(DirectoryUser).filter(DirectoryUser.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404, detail="user not found")
    db.delete(u)
    db.commit()
    return Response(status_code=204)


@app.post("/api/users/sync", response_model=UserSyncOut)
def sync_users(
    payload: UserSyncIn,
    db: Session = Depends(get_db),
    _key: str = Depends(require_api_key),
):
    """Universal user-sync interface: upsert external users keyed by
    (source, external_id). Idempotent — re-sending the same payload changes
    nothing and reports zero counts. See docs/user-sync.md."""
    source = (payload.source or "").strip()
    if not source:
        raise HTTPException(status_code=422, detail="source is required")
    created = updated = deactivated = 0
    errors = []
    max_order = db.query(func.max(DirectoryUser.sort_order)).scalar() or 0
    for i, item in enumerate(payload.users):
        ext = (item.external_id or "").strip()
        name = (item.name or "").strip()
        if not ext or not name:
            errors.append(
                UserSyncError(
                    index=i,
                    external_id=ext or None,
                    error="external_id and name are required",
                )
            )
            continue
        existing = (
            db.query(DirectoryUser)
            .filter(DirectoryUser.source == source, DirectoryUser.external_id == ext)
            .first()
        )
        now = datetime.utcnow()
        if existing is None:
            max_order += 1
            initials = "".join(w[0] for w in re.split(r"[\s\-]+", name) if w)[:2].upper() or "?"
            new_id = f"u-{source}-{ext}"[:64]
            suffix = 2
            while (
                db.query(DirectoryUser).filter(DirectoryUser.id == new_id).first()
                is not None
            ):
                new_id = f"u-{source}-{ext}-{suffix}"[:64]
                suffix += 1
            db.add(
                DirectoryUser(
                    id=new_id,
                    name=name,
                    email=(item.email or "").strip(),
                    role=(item.role or "").strip(),
                    avatar_url=(item.avatar_url or "").strip(),
                    initials=initials,
                    color="#737373",
                    source=source,
                    external_id=ext,
                    active=item.active if item.active is not None else True,
                    synced_at=now,
                    sort_order=max_order,
                )
            )
            created += 1
            continue
        changed = False
        for field, value in {
            "name": name,
            "email": (item.email or "").strip() if item.email is not None else None,
            "role": (item.role or "").strip() if item.role is not None else None,
            "avatar_url": (item.avatar_url or "").strip()
            if item.avatar_url is not None
            else None,
        }.items():
            if value is not None and getattr(existing, field) != value:
                setattr(existing, field, value)
                changed = True
        if item.active is not None and bool(existing.active) != bool(item.active):
            existing.active = bool(item.active)
            changed = True
            if not item.active:
                deactivated += 1
        if changed:
            existing.synced_at = now
            if not (item.active is not None and not item.active):
                updated += 1
    db.commit()
    return UserSyncOut(
        created=created, updated=updated, deactivated=deactivated, errors=errors
    )


@app.get("/api/projects", response_model=list[ProjectOut])
def list_projects():
    return PROJECTS


def _list_tickets(
    db: Session,
    status: str | None = None,
    priority: str | None = None,
    project: str | None = None,
    q: str | None = None,
):
    query = db.query(Ticket)
    if status:
        query = query.filter(Ticket.status == status)
    if priority:
        query = query.filter(Ticket.priority == priority)
    if project:
        query = query.filter(Ticket.project_id == project)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (Ticket.title.ilike(like)) | (Ticket.code.ilike(like))
        )
    tickets = query.order_by(Ticket.status, Ticket.position, Ticket.id).all()
    return [ticket_out(t) for t in tickets]


@app.get("/api/tickets", response_model=list[TicketOut])
def list_tickets(
    db: Session = Depends(get_db),
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    project: str | None = Query(default=None),
    q: str | None = Query(default=None),
):
    return _list_tickets(db, status, priority, project, q)


@app.get("/api/t", response_model=list[TicketOut])
def list_tickets_short(
    db: Session = Depends(get_db),
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    project: str | None = Query(default=None),
    q: str | None = Query(default=None),
):
    return _list_tickets(db, status, priority, project, q)


@app.get("/api/board", response_model=BoardOut)
def get_board(db: Session = Depends(get_db)):
    columns = []
    for status in STATUSES:
        tickets = (
            db.query(Ticket)
            .filter(Ticket.status == status)
            .order_by(Ticket.position, Ticket.id)
            .all()
        )
        outs = [ticket_out(t) for t in tickets]
        columns.append(
            BoardColumn(
                status=status,
                label=STATUS_LABELS[status],
                count=len(outs),
                total=len(outs),
                tickets=outs,
            )
        )
    return BoardOut(columns=columns)


@app.get("/api/tickets/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    return ticket_out(get_ticket_or_404(db, ticket_id))


@app.post("/api/tickets", response_model=TicketOut, status_code=201)
def create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db),
    _key: str = Depends(require_write_auth),
):
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="title is required")
    if payload.status not in STATUSES:
        raise HTTPException(status_code=422, detail=f"invalid status: {payload.status}")
    if payload.priority not in PRIORITIES:
        raise HTTPException(status_code=422, detail=f"invalid priority: {payload.priority}")
    prefix = (payload.prefix or "FE").upper()
    if prefix not in PREFIXES:
        raise HTTPException(status_code=422, detail=f"invalid prefix: {prefix}")
    now = datetime.utcnow()
    t = Ticket(
        code=next_code(db, prefix),
        category=payload.category or "",
        title=title,
        description=payload.description or "",
        status=payload.status,
        priority=payload.priority,
        project_id=payload.project_id,
        assignee_ids=json.dumps(payload.assignee_ids or [], ensure_ascii=False),
        created_at=now,
        updated_at=now,
        completed_at=now if payload.status == "done" else None,
        position=end_position(db, payload.status),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return ticket_out(t)


@app.patch("/api/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    db: Session = Depends(get_db),
    _key: str = Depends(require_write_auth),
):
    t = get_ticket_or_404(db, ticket_id)
    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in STATUSES:
        raise HTTPException(status_code=422, detail=f"invalid status: {data['status']}")
    if "priority" in data and data["priority"] not in PRIORITIES:
        raise HTTPException(status_code=422, detail=f"invalid priority: {data['priority']}")
    if "title" in data:
        title = (data["title"] or "").strip()
        if not title:
            raise HTTPException(status_code=422, detail="title is required")
        t.title = title
    if "description" in data:
        t.description = data["description"] or ""
    if "category" in data:
        t.category = data["category"] or ""
    if "status" in data:
        new_status = data["status"]
        if new_status != t.status:
            t.status = new_status
            if new_status == "done":
                t.completed_at = datetime.utcnow()
            else:
                t.completed_at = None
    if "priority" in data:
        t.priority = data["priority"]
    if "project_id" in data:
        t.project_id = data["project_id"]
    if "assignee_ids" in data:
        t.assignee_ids = json.dumps(data["assignee_ids"] or [], ensure_ascii=False)
    if "position" in data and data["position"] is not None:
        t.position = data["position"]
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return ticket_out(t)


@app.delete("/api/tickets/{ticket_id}", status_code=204)
def delete_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    _key: str = Depends(require_write_auth),
):
    t = get_ticket_or_404(db, ticket_id)
    db.query(Comment).filter(Comment.ticket_id == ticket_id).delete()
    db.delete(t)
    db.commit()
    return Response(status_code=204)


@app.post("/api/uploads", response_model=UploadOut, status_code=201)
async def upload_image(
    file: UploadFile = File(...),
    _auth: dict = Depends(require_write_auth),
):
    """Upload one image (jpeg/png/gif/webp, at most 10 MB).

    The file is stored under UPLOAD_DIR (backend/data/uploads, inside the
    persistent volume) with a uuid filename, and served back at the
    returned ``/uploads/<name>`` path. Non-image content types and
    oversized files are rejected with 400.
    """
    ext = ALLOWED_IMAGE_TYPES.get((file.content_type or "").lower())
    if ext is None:
        raise HTTPException(
            status_code=400, detail="only jpeg/png/gif/webp images are accepted"
        )
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="image exceeds 10 MB")
        chunks.append(chunk)
    if total == 0:
        raise HTTPException(status_code=400, detail="empty file")
    name = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / name).write_bytes(b"".join(chunks))
    return UploadOut(url=f"/uploads/{name}")


@app.get("/api/tickets/{ticket_id}/comments", response_model=list[CommentOut])
def list_comments(ticket_id: int, db: Session = Depends(get_db)):
    get_ticket_or_404(db, ticket_id)
    comments = (
        db.query(Comment)
        .filter(Comment.ticket_id == ticket_id)
        .order_by(Comment.created_at, Comment.id)
        .all()
    )
    return [
        CommentOut(
            id=c.id,
            ticket_id=c.ticket_id,
            author_id=c.author_id,
            author_name=c.author_name,
            body=c.body,
            created_at=c.created_at,
        )
        for c in comments
    ]


@app.post("/api/tickets/{ticket_id}/comments", response_model=CommentOut, status_code=201)
def create_comment(
    ticket_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    _key: str = Depends(require_write_auth),
):
    get_ticket_or_404(db, ticket_id)
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=422, detail="body is required")
    # Comment authorship rule:
    # - Called with a Bearer JWT (the browser UI): the author is always
    #   the logged-in account — author_id "account:<id>", author_name the
    #   account's display name. A payload author_id is ignored; the UI no
    #   longer lets the user comment as someone else.
    # - Called with only the X-API-Key (MCP / scripts): payload author_id
    #   is honoured as before (defaults to "u-noah").
    account = _jwt_account_or_none(authorization, db)
    if account is not None:
        author_id = f"account:{account.id}"
        author_name = account.name
    else:
        author_id = payload.author_id or "u-noah"
        author_name = _user_display_name(db, author_id)
    c = Comment(
        ticket_id=ticket_id,
        author_id=author_id,
        author_name=author_name,
        body=body,
        created_at=datetime.utcnow(),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return CommentOut(
        id=c.id,
        ticket_id=c.ticket_id,
        author_id=c.author_id,
        author_name=c.author_name,
        body=c.body,
        created_at=c.created_at,
    )


@app.get("/api/tickets/{ticket_id}/token-stats", response_model=TokenStatsOut)
def token_stats(ticket_id: int, db: Session = Depends(get_db)):
    get_ticket_or_404(db, ticket_id)
    # Same rising shape for every ticket, scaled deterministically by id.
    # Ticket 1 reproduces the reference curve exactly (total 12,100,000).
    factor = 1.0 + (ticket_id - 1) * 0.05
    points = [
        TokenPoint(date=f"2026-09-{day:02d}", tokens=int(round(v * factor)))
        for day, v in enumerate(TOKEN_BASE, start=1)
    ]
    total = sum(p.tokens for p in points)
    delta_pct = round(4.9 + (ticket_id - 1) * 0.2, 1)
    return TokenStatsOut(
        ticket_id=ticket_id, total_tokens=total, delta_pct=delta_pct, points=points
    )
