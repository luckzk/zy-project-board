"""Database setup for zy-project-board backend.

SQLite file lives at backend/data/board.db (created on startup).
"""
import json
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.environ.get(
    "DATABASE_URL", f"sqlite:///{DATA_DIR / 'board.db'}"
)

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def backfill_notifications(db) -> int:
    """One-time backfill of the notifications table from real data.

    One "created" notification per existing ticket and one "new
    comment" notification per existing comment, each stamped with the
    row's own real created_at. Runs only while the notifications
    table is empty, so it is safe to call on every startup; call it
    *after* seeding (a fresh DB has no tickets to backfill from yet).
    """
    from app.models import Comment, Notification, Ticket

    if db.query(Notification).count() > 0:
        return 0
    tickets = db.query(Ticket).order_by(Ticket.created_at, Ticket.id).all()
    codes = {t.id: t.code for t in tickets}
    count = 0
    for t in tickets:
        db.add(
            Notification(
                type="ticket",
                title=f"创建了票据 {t.code}",
                description=t.title or "",
                ticket_id=t.id,
                actor_name=None,
                is_read=False,
                created_at=t.created_at,
            )
        )
        count += 1
    comments = db.query(Comment).order_by(Comment.created_at, Comment.id).all()
    for c in comments:
        db.add(
            Notification(
                type="ticket",
                title=f"{codes.get(c.ticket_id, '')} 有新评论",
                description=(c.body or "")[:80],
                ticket_id=c.ticket_id,
                actor_name=c.author_name,
                is_read=False,
                created_at=c.created_at,
            )
        )
        count += 1
    if count:
        db.commit()
    return count


def init_db():
    from app import models  # noqa: F401  (register models on Base)

    Base.metadata.create_all(bind=engine)
    # Lightweight migration for DBs created before Ticket.category existed:
    # create_all() never adds a column to an existing table.
    from sqlalchemy import inspect, text

    with engine.begin() as conn:
        cols = {c["name"] for c in inspect(conn).get_columns("tickets")}
        if "category" not in cols:
            conn.execute(text("ALTER TABLE tickets ADD COLUMN category VARCHAR(128) NOT NULL DEFAULT ''"))
            from app.seed import CATEGORY_BY_CODE

            for code, category in CATEGORY_BY_CODE.items():
                conn.execute(
                    text("UPDATE tickets SET category = :category WHERE code = :code AND (category IS NULL OR category = '')"),
                    {"category": category, "code": code},
                )

    # One-time seed correction: DS-38 ships with two assignees (Maya Chen,
    # Priya Shah) in seed.py, but an earlier deploy left Daniel Kim attached
    # on some existing DBs (seed only runs when the table is empty, so it
    # never repairs that). Remove him from DS-38 only, preserving any other
    # assignees; no-op when he is already absent.
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT assignee_ids FROM tickets WHERE code = 'DS-38'")
        ).fetchone()
        if row is not None:
            try:
                assignees = json.loads(row[0] or "[]")
            except (TypeError, ValueError):
                assignees = []
            if isinstance(assignees, list) and "u-daniel" in assignees:
                assignees = [a for a in assignees if a != "u-daniel"]
                conn.execute(
                    text("UPDATE tickets SET assignee_ids = :ids WHERE code = 'DS-38'"),
                    {"ids": json.dumps(assignees, ensure_ascii=False)},
                )
