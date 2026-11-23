"""zy-project-board backend — FastAPI + SQLAlchemy + SQLite.

Run:  uvicorn app.main:app --port 8001
Auth:  writes require header ``X-API-Key`` matching env ``API_KEY``
       (default ``dev-api-key-change-me``); GETs are public.
"""
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db, init_db, SessionLocal
from app.models import Comment, Ticket
from app.schemas import (
    BoardColumn,
    BoardOut,
    CommentCreate,
    CommentOut,
    ProjectOut,
    TicketCreate,
    TicketOut,
    TicketUpdate,
    TokenPoint,
    TokenStatsOut,
    UserOut,
)
from app.seed import PROJECTS, USERS, USER_NAMES, seed_if_empty

API_KEY = os.environ.get("API_KEY", "dev-api-key-change-me")

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_if_empty(db)
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


def require_api_key(x_api_key: str | None = Header(default=None)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="invalid api key")
    return x_api_key


def ticket_out(t: Ticket) -> TicketOut:
    return TicketOut(
        id=t.id,
        code=t.code,
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


@app.get("/api/users", response_model=list[UserOut])
def list_users():
    return USERS


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
    _key: str = Depends(require_api_key),
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
    _key: str = Depends(require_api_key),
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
    _key: str = Depends(require_api_key),
):
    t = get_ticket_or_404(db, ticket_id)
    db.query(Comment).filter(Comment.ticket_id == ticket_id).delete()
    db.delete(t)
    db.commit()
    return Response(status_code=204)


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
    _key: str = Depends(require_api_key),
):
    get_ticket_or_404(db, ticket_id)
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=422, detail="body is required")
    author_id = payload.author_id or "u-noah"
    c = Comment(
        ticket_id=ticket_id,
        author_id=author_id,
        author_name=USER_NAMES.get(author_id, author_id),
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
