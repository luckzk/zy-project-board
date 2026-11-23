"""zy-project-board backend — FastAPI + SQLAlchemy + SQLite.

Run:  uvicorn app.main:app --port 8001
Auth:  writes require header ``X-API-Key`` matching env ``API_KEY``
       (default ``dev-api-key-change-me``) OR a JWT from /api/auth/login
       as ``Authorization: Bearer <token>``; GETs are public.
       JWT secret comes from env ``SECRET_KEY`` (dev fallback only).
       Project permissions (round 13): a JWT caller only sees the
       projects they are a member of (and their tickets, comments and
       notifications); an X-API-Key caller is the trusted management
       path and sees everything. Non-members answer 404, the same as
       "does not exist".
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
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import (
    backfill_notifications,
    backfill_project_members,
    get_db,
    init_db,
    SessionLocal,
)
from app.models import (
    Account,
    Comment,
    DirectoryUser,
    Notification,
    Project,
    ProjectMember,
    Ticket,
)
from app.schemas import (
    AccountOut,
    AuthLogin,
    AuthOut,
    AuthRegister,
    AuthUserOut,
    BoardColumn,
    BoardOut,
    ChangePassword,
    CommentCreate,
    CommentOut,
    MarkAllReadOut,
    MemberAddIn,
    NotificationOut,
    ProjectCreate,
    ProjectMemberOut,
    ProjectOut,
    ProjectUpdate,
    TicketCreate,
    TicketOut,
    TicketUpdate,
    TokenPoint,
    TokenStatsOut,
    UnreadCountOut,
    UpdateMe,
    UploadOut,
    UserOut,
    UserSyncError,
    UserSyncIn,
    UserSyncOut,
)
from app.seed import (
    USER_NAMES,
    seed_demo_account,
    seed_directory_users,
    seed_if_empty,
    seed_projects,
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
        # Projects must exist before the member backfill below.
        seed_projects(db)
        # Backfill after seeding: a fresh DB has no tickets to backfill
        # from until seed_if_empty runs; an existing DB gets its real
        # history once, because backfill is a no-op when the table is
        # non-empty.
        backfill_notifications(db)
        seed_directory_users(db)
        seed_demo_account(db)
        # Last: every existing account joins every existing project, so
        # the permission upgrade locks nobody out. Idempotent.
        backfill_project_members(db)
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


# ---- Project permissions (round 13) ----
#
# Two caller kinds, distinguished on every request that touches project
# data:
# - ``api_key``: a valid X-API-Key (MCP / scripts). Trusted management
#   path: no membership check, all projects and tickets are visible,
#   so existing MCP capability is unchanged.
# - ``jwt``: a logged-in account (the browser UI). Only member projects
#   are visible; everything else answers 404 — the same response as
#   "does not exist", so a 404 never leaks whether the project or
#   ticket exists.
# - ``anon``: no credential at all. Public GETs behave exactly as
#   before (unfiltered); writes are already rejected by
#   require_write_auth.

def _auth_context(
    authorization: str | None,
    x_api_key: str | None,
    db: Session,
) -> tuple[str, Account | None]:
    if x_api_key is not None and x_api_key == API_KEY:
        return ("api_key", None)
    account = _jwt_account_or_none(authorization, db)
    if account is not None:
        return ("jwt", account)
    return ("anon", None)


def _member_project_ids(db: Session, account: Account) -> set[str]:
    return {
        row[0]
        for row in db.query(ProjectMember.project_id)
        .filter(ProjectMember.account_id == account.id)
        .all()
    }


def _is_member(db: Session, account: Account, project_id: str) -> bool:
    return (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.account_id == account.id,
        )
        .first()
        is not None
    )


def _require_project_visible(
    db: Session,
    auth: tuple[str, Account | None],
    project_id: str,
) -> None:
    """404 unless the caller may see this project.

    JWT callers must be members; API-Key and anonymous callers are
    not restricted. A missing project answers the same 404.
    """
    kind, account = auth
    if kind == "jwt" and account is not None and not _is_member(db, account, project_id):
        raise HTTPException(status_code=404, detail="project not found")


def _require_ticket_access(
    db: Session,
    auth: tuple[str, Account | None],
    ticket: Ticket,
) -> None:
    """404 unless the caller may see this ticket (membership of the
    ticket's project for JWT callers; unrestricted otherwise)."""
    kind, account = auth
    if kind == "jwt" and account is not None and not _is_member(db, account, ticket.project_id):
        raise HTTPException(status_code=404, detail="ticket not found")


def _project_out(db: Session, p: Project) -> ProjectOut:
    return ProjectOut(
        id=p.id,
        name=p.name,
        member_count=db.query(ProjectMember)
        .filter(ProjectMember.project_id == p.id)
        .count(),
        ticket_count=db.query(Ticket).filter(Ticket.project_id == p.id).count(),
    )


def _member_out(db: Session, m: ProjectMember) -> ProjectMemberOut:
    account = db.query(Account).filter(Account.id == m.account_id).first()
    return ProjectMemberOut(
        account_id=m.account_id,
        name=account.name if account else f"账号 {m.account_id}",
        email=account.email if account else "",
        role=m.role,
    )


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
        created_by=t.created_by,
        is_favorite=bool(t.is_favorite),
        created_at=t.created_at,
        updated_at=t.updated_at,
        completed_at=t.completed_at,
        position=t.position,
    )


def notification_out(n: Notification) -> NotificationOut:
    return NotificationOut(
        id=n.id,
        type=n.type,
        title=n.title,
        description=n.description or "",
        ticket_id=n.ticket_id,
        actor_name=n.actor_name,
        is_read=bool(n.is_read),
        created_at=n.created_at,
    )


def _add_notification(
    db: Session,
    *,
    type: str,
    title: str,
    description: str = "",
    ticket_id: int | None = None,
    actor_name: str | None = None,
    created_at=None,
) -> Notification:
    """Queue a bell notification in the caller's transaction.

    Callers add it to the same session and commit once, so a ticket
    write and its notification either both land or neither does.
    """
    n = Notification(
        type=type,
        title=title,
        description=description,
        ticket_id=ticket_id,
        actor_name=actor_name,
        is_read=False,
        created_at=created_at or datetime.utcnow(),
    )
    db.add(n)
    return n


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
    if created > 0:
        _add_notification(
            db,
            type="system",
            title=f"同步了 {created} 位新用户",
            description=f"来源：{source}",
        )
    db.commit()
    return UserSyncOut(
        created=created, updated=updated, deactivated=deactivated, errors=errors
    )


@app.get("/api/projects", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    """Projects, with member and ticket counts.

    A logged-in (JWT) caller sees only the projects they are a member
    of; API-Key and anonymous callers see all of them.
    """
    kind, account = _auth_context(authorization, x_api_key, db)
    query = db.query(Project).order_by(Project.name, Project.id)
    if kind == "jwt" and account is not None:
        query = query.filter(Project.id.in_(_member_project_ids(db, account)))
    return [_project_out(db, p) for p in query.all()]


@app.post("/api/projects", response_model=ProjectOut, status_code=201)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    _auth=Depends(require_write_auth),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    if len(name) > 100:
        raise HTTPException(status_code=422, detail="name is too long")
    project = Project(
        id=f"p-{uuid.uuid4().hex[:12]}",
        name=name,
        created_at=datetime.utcnow(),
    )
    db.add(project)
    # The creator joins automatically. An API-Key caller has no
    # account, so its projects start with no members (add them via
    # POST /api/projects/{id}/members).
    account = _jwt_account_or_none(authorization, db)
    if account is not None:
        db.add(
            ProjectMember(
                project_id=project.id,
                account_id=account.id,
                role="member",
                created_at=datetime.utcnow(),
            )
        )
    db.commit()
    db.refresh(project)
    return _project_out(db, project)


@app.patch("/api/projects/{project_id}", response_model=ProjectOut)
def rename_project(
    project_id: str,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
    _auth=Depends(require_write_auth),
):
    """Rename a project. JWT callers must be members (404 otherwise)."""
    auth = _auth_context(authorization, x_api_key, db)
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")
    _require_project_visible(db, auth, project_id)
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    if len(name) > 100:
        raise HTTPException(status_code=422, detail="name is too long")
    project.name = name
    db.commit()
    db.refresh(project)
    return _project_out(db, project)


@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
    _auth=Depends(require_write_auth),
):
    """Delete a project — only when it has no tickets left (400
    otherwise). JWT callers must be members (404 otherwise)."""
    auth = _auth_context(authorization, x_api_key, db)
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")
    _require_project_visible(db, auth, project_id)
    ticket_count = db.query(Ticket).filter(Ticket.project_id == project_id).count()
    if ticket_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"项目下还有 {ticket_count} 张票据，无法删除",
        )
    db.query(ProjectMember).filter(ProjectMember.project_id == project_id).delete()
    db.delete(project)
    db.commit()
    return Response(status_code=204)


@app.get("/api/projects/{project_id}/members", response_model=list[ProjectMemberOut])
def list_project_members(
    project_id: str,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    """Members of a project. JWT callers must be members (404
    otherwise); the project itself answers 404 when it does not exist."""
    auth = _auth_context(authorization, x_api_key, db)
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")
    _require_project_visible(db, auth, project_id)
    members = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.account_id)
        .all()
    )
    return [_member_out(db, m) for m in members]


@app.post("/api/projects/{project_id}/members", response_model=ProjectMemberOut)
def add_project_member(
    project_id: str,
    payload: MemberAddIn,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
    _auth=Depends(require_write_auth),
):
    """Add a member. Any member may add members. Idempotent: adding
    someone who is already a member returns the existing membership."""
    auth = _auth_context(authorization, x_api_key, db)
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")
    _require_project_visible(db, auth, project_id)
    account = db.query(Account).filter(Account.id == payload.account_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="account not found")
    existing = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.account_id == payload.account_id,
        )
        .first()
    )
    if existing is not None:
        return _member_out(db, existing)
    member = ProjectMember(
        project_id=project_id,
        account_id=payload.account_id,
        role="member",
        created_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return _member_out(db, member)


@app.delete("/api/projects/{project_id}/members/{account_id}", status_code=204)
def remove_project_member(
    project_id: str,
    account_id: int,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
    _auth=Depends(require_write_auth),
):
    """Remove a member. Any member may remove members, except the last
    one: a project always keeps at least one member."""
    auth = _auth_context(authorization, x_api_key, db)
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")
    _require_project_visible(db, auth, project_id)
    member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.account_id == account_id,
        )
        .first()
    )
    if member is None:
        raise HTTPException(status_code=404, detail="member not found")
    remaining = (
        db.query(ProjectMember).filter(ProjectMember.project_id == project_id).count()
    )
    if remaining <= 1:
        raise HTTPException(status_code=400, detail="不能移除项目的最后一名成员")
    db.delete(member)
    db.commit()
    return Response(status_code=204)


@app.get("/api/accounts", response_model=list[AccountOut])
def list_accounts(db: Session = Depends(get_db)):
    """Login accounts, for the member picker: id, name and email only."""
    return [
        AccountOut(id=a.id, name=a.name, email=a.email)
        for a in db.query(Account).order_by(Account.name, Account.id).all()
    ]


def _list_tickets(
    db: Session,
    status: str | None = None,
    priority: str | None = None,
    project: str | None = None,
    q: str | None = None,
    auth: tuple[str, Account | None] | None = None,
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
    # JWT callers only see tickets in projects they are members of.
    if auth is not None and auth[0] == "jwt" and auth[1] is not None:
        query = query.filter(Ticket.project_id.in_(_member_project_ids(db, auth[1])))
    tickets = query.order_by(Ticket.status, Ticket.position, Ticket.id).all()
    return [ticket_out(t) for t in tickets]


@app.get("/api/tickets", response_model=list[TicketOut])
def list_tickets(
    db: Session = Depends(get_db),
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    project: str | None = Query(default=None),
    q: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    return _list_tickets(
        db, status, priority, project, q,
        _auth_context(authorization, x_api_key, db),
    )


@app.get("/api/t", response_model=list[TicketOut])
def list_tickets_short(
    db: Session = Depends(get_db),
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    project: str | None = Query(default=None),
    q: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    return _list_tickets(
        db, status, priority, project, q,
        _auth_context(authorization, x_api_key, db),
    )


@app.get("/api/board", response_model=BoardOut)
def get_board(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    kind, account = _auth_context(authorization, x_api_key, db)
    member_ids = (
        _member_project_ids(db, account)
        if kind == "jwt" and account is not None
        else None
    )
    columns = []
    for status in STATUSES:
        query = db.query(Ticket).filter(Ticket.status == status)
        if member_ids is not None:
            query = query.filter(Ticket.project_id.in_(member_ids))
        tickets = query.order_by(Ticket.position, Ticket.id).all()
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
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    t = get_ticket_or_404(db, ticket_id)
    _require_ticket_access(db, _auth_context(authorization, x_api_key, db), t)
    return ticket_out(t)


@app.get("/api/tickets/by-code/{code}", response_model=TicketOut)
def get_ticket_by_code(
    code: str,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    """One ticket by its public code (e.g. FE-87), for deep links.

    The drawer link is ``/#ticket=<code>``; the frontend resolves the
    code to an id through this endpoint. Unknown codes are 404 — and so
    are codes in projects the JWT caller is not a member of (the two
    cases are deliberately indistinguishable).
    """
    t = db.query(Ticket).filter(Ticket.code == code).first()
    if t is None:
        raise HTTPException(status_code=404, detail="ticket not found")
    _require_ticket_access(db, _auth_context(authorization, x_api_key, db), t)
    return ticket_out(t)


@app.post("/api/tickets", response_model=TicketOut, status_code=201)
def create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
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
    # Creator display name, same rule as comment authorship: a Bearer
    # JWT forces the logged-in account's name; an API-Key caller may
    # pass created_by, otherwise it is recorded as "API".
    account = _jwt_account_or_none(authorization, db)
    # JWT callers may only create tickets in projects they belong to;
    # a project that does not exist (or is not theirs) answers 404.
    if account is not None and not _is_member(db, account, payload.project_id):
        raise HTTPException(status_code=404, detail="project not found")
    created_by = account.name if account is not None else (payload.created_by or "API")
    t = Ticket(
        code=next_code(db, prefix),
        category=payload.category or "",
        title=title,
        description=payload.description or "",
        status=payload.status,
        priority=payload.priority,
        project_id=payload.project_id,
        assignee_ids=json.dumps(payload.assignee_ids or [], ensure_ascii=False),
        created_by=created_by,
        is_favorite=False,
        created_at=now,
        updated_at=now,
        completed_at=now if payload.status == "done" else None,
        position=end_position(db, payload.status),
    )
    db.add(t)
    db.flush()  # assign t.id so the notification can link to the ticket
    _add_notification(
        db,
        type="ticket",
        title=f"创建了票据 {t.code}",
        description=title,
        ticket_id=t.id,
    )
    db.commit()
    db.refresh(t)
    return ticket_out(t)


@app.patch("/api/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    _key: str = Depends(require_write_auth),
):
    t = get_ticket_or_404(db, ticket_id)
    data = payload.model_dump(exclude_unset=True)
    # JWT callers must belong to the ticket's project; moving the ticket
    # to another project additionally requires membership there.
    account = _jwt_account_or_none(authorization, db)
    if account is not None:
        if not _is_member(db, account, t.project_id):
            raise HTTPException(status_code=404, detail="ticket not found")
        if (
            "project_id" in data
            and data["project_id"] != t.project_id
            and not _is_member(db, account, data["project_id"])
        ):
            raise HTTPException(status_code=404, detail="project not found")
    if "status" in data and data["status"] not in STATUSES:
        raise HTTPException(status_code=422, detail=f"invalid status: {data['status']}")
    if "priority" in data and data["priority"] not in PRIORITIES:
        raise HTTPException(status_code=422, detail=f"invalid priority: {data['priority']}")
    old_status = t.status
    old_assignees = set(json.loads(t.assignee_ids or "[]"))
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
    if "is_favorite" in data and data["is_favorite"] is not None:
        t.is_favorite = bool(data["is_favorite"])
    # created_by is read-only: it is not a TicketUpdate field, so a
    # client-sent value never reaches here.
    t.updated_at = datetime.utcnow()
    # Bell notifications, same transaction as the ticket write:
    # - a real status change (not a re-save of the same status)
    # - each newly assigned person (removals and unchanged assignees
    #   do not notify)
    if "status" in data and data["status"] != old_status:
        _add_notification(
            db,
            type="ticket",
            title=f"{t.code} 移入{STATUS_LABELS[data['status']]}",
            description=t.title,
            ticket_id=t.id,
        )
    if "assignee_ids" in data:
        for uid in sorted(set(json.loads(t.assignee_ids or "[]")) - old_assignees):
            _add_notification(
                db,
                type="mention",
                title=f"你被指派到 {t.code}",
                description=t.title,
                ticket_id=t.id,
                actor_name=_user_display_name(db, uid),
            )
    db.commit()
    db.refresh(t)
    return ticket_out(t)


@app.delete("/api/tickets/{ticket_id}", status_code=204)
def delete_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    _key: str = Depends(require_write_auth),
):
    t = get_ticket_or_404(db, ticket_id)
    account = _jwt_account_or_none(authorization, db)
    if account is not None and not _is_member(db, account, t.project_id):
        raise HTTPException(status_code=404, detail="ticket not found")
    db.query(Comment).filter(Comment.ticket_id == ticket_id).delete()
    db.delete(t)
    db.commit()
    return Response(status_code=204)


@app.post("/api/uploads", response_model=UploadOut, status_code=201)
async def upload_image(
    file: UploadFile = File(...),
    ticket_id: int | None = Form(default=None),
    project_id: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_write_auth),
):
    """Upload one image (jpeg/png/gif/webp, at most 10 MB).

    The file is stored under UPLOAD_DIR (backend/data/uploads, inside the
    persistent volume) with a uuid filename, and served back at the
    returned ``/uploads/<name>`` path. Non-image content types and
    oversized files are rejected with 400.

    The drawer passes ``ticket_id`` and the new-ticket dialog passes
    ``project_id``; a JWT caller must be a member of that project
    (404 otherwise). Without either, a JWT caller may still upload —
    the image only becomes visible when pasted into a ticket the
    caller can edit.
    """
    account = _jwt_account_or_none(authorization, db)
    if account is not None:
        if ticket_id is not None:
            ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
            if ticket is None or not _is_member(db, account, ticket.project_id):
                raise HTTPException(status_code=404, detail="ticket not found")
        elif project_id:
            if not _is_member(db, account, project_id):
                raise HTTPException(status_code=404, detail="project not found")
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
def list_comments(
    ticket_id: int,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    ticket = get_ticket_or_404(db, ticket_id)
    _require_ticket_access(db, _auth_context(authorization, x_api_key, db), ticket)
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
    ticket = get_ticket_or_404(db, ticket_id)
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=422, detail="body is required")
    # JWT callers must belong to the ticket's project.
    # Comment authorship rule:
    # - Called with a Bearer JWT (the browser UI): the author is always
    #   the logged-in account — author_id "account:<id>", author_name the
    #   account's display name. A payload author_id is ignored; the UI no
    #   longer lets the user comment as someone else.
    # - Called with only the X-API-Key (MCP / scripts): payload author_id
    #   is honoured as before (defaults to "u-noah").
    account = _jwt_account_or_none(authorization, db)
    if account is not None:
        if not _is_member(db, account, ticket.project_id):
            raise HTTPException(status_code=404, detail="ticket not found")
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
    _add_notification(
        db,
        type="ticket",
        title=f"{ticket.code} 有新评论",
        description=body[:80],
        ticket_id=ticket.id,
        actor_name=author_name,
    )
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
def token_stats(
    ticket_id: int,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    ticket = get_ticket_or_404(db, ticket_id)
    _require_ticket_access(db, _auth_context(authorization, x_api_key, db), ticket)
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


# ---- Notifications: the header bell, backed by real board events ----
#
# Rows are written by the ticket/comment/sync endpoints in the same
# transaction as the change they describe (see _add_notification), and
# backfilled once from real history on first startup. Nothing here is
# demo data. Reads are public, like the rest of the GETs; marking read
# is a write, so it takes the X-API-Key or a Bearer JWT.

NOTIF_TYPES = ["ticket", "mention", "system"]


def _visible_notifications_query(
    db: Session, auth: tuple[str, Account | None]
):
    """Notifications a caller may see.

    API-Key and anonymous callers see everything. A JWT caller sees
    system notifications (no ticket) plus notifications whose ticket
    sits in one of their member projects — nothing else.
    """
    query = db.query(Notification)
    kind, account = auth
    if kind == "jwt" and account is not None:
        member_ids = _member_project_ids(db, account)
        if member_ids:
            query = query.filter(
                (Notification.ticket_id.is_(None))
                | (
                    Notification.ticket_id.in_(
                        db.query(Ticket.id).filter(
                            Ticket.project_id.in_(member_ids)
                        )
                    )
                )
            )
        else:
            query = query.filter(Notification.ticket_id.is_(None))
    return query


@app.get("/api/notifications", response_model=list[NotificationOut])
def list_notifications(
    db: Session = Depends(get_db),
    unread_only: bool = Query(default=False),
    type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    if type is not None and type not in NOTIF_TYPES:
        raise HTTPException(status_code=422, detail=f"invalid type: {type}")
    query = _visible_notifications_query(
        db, _auth_context(authorization, x_api_key, db)
    ).order_by(Notification.created_at.desc(), Notification.id.desc())
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    if type:
        query = query.filter(Notification.type == type)
    return [notification_out(n) for n in query.limit(limit).all()]


@app.get("/api/notifications/unread-count", response_model=UnreadCountOut)
def notifications_unread_count(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    count = (
        _visible_notifications_query(db, _auth_context(authorization, x_api_key, db))
        .filter(Notification.is_read.is_(False))
        .count()
    )
    return UnreadCountOut(unread=count)


@app.post("/api/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
    _auth=Depends(require_write_auth),
):
    # Out-of-scope notifications answer 404, like missing ones.
    n = (
        _visible_notifications_query(db, _auth_context(authorization, x_api_key, db))
        .filter(Notification.id == notification_id)
        .first()
    )
    if n is None:
        raise HTTPException(status_code=404, detail="notification not found")
    n.is_read = True
    db.commit()
    db.refresh(n)
    return notification_out(n)


@app.post("/api/notifications/read-all", response_model=MarkAllReadOut)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
    _auth=Depends(require_write_auth),
):
    # Only the caller's visible notifications are marked.
    marked = (
        _visible_notifications_query(db, _auth_context(authorization, x_api_key, db))
        .filter(Notification.is_read.is_(False))
        .update({"is_read": True})
    )
    db.commit()
    return MarkAllReadOut(ok=True, marked=marked)
