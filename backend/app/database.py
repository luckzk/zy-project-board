"""Database setup for zy-project-board backend.

SQLite file lives at backend/data/board.db (created on startup).
"""
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
