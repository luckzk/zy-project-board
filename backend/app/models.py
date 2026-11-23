"""SQLAlchemy models for zy-project-board backend."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.database import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, nullable=False, index=True)
    category = Column(String(128), nullable=False, default="")
    title = Column(String(512), nullable=False)
    description = Column(Text, nullable=False, default="")
    status = Column(String(32), nullable=False, default="todo", index=True)
    priority = Column(String(32), nullable=False, default="low")
    project_id = Column(String(64), nullable=False, default="p-boardui", index=True)
    # JSON-encoded list of user ids, e.g. '["u-maya", "u-priya"]'
    assignee_ids = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    position = Column(Integer, nullable=False, default=0)


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    author_id = Column(String(64), nullable=False)
    author_name = Column(String(128), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False)


class Account(Base):
    """A login account (register/login), separate from directory users."""

    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    email = Column(String(256), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    created_at = Column(DateTime, nullable=False)


class DirectoryUser(Base):
    """A person in the mock people directory.

    Seed users come from seed.py; external platforms sync in via
    POST /api/users/sync, keyed by (source, external_id).
    """

    __tablename__ = "directory_users"
    __table_args__ = (UniqueConstraint("source", "external_id"),)

    id = Column(String(64), primary_key=True)
    name = Column(String(128), nullable=False)
    email = Column(String(256), nullable=False, default="")
    role = Column(String(128), nullable=False, default="")
    avatar_url = Column(String(512), nullable=False, default="")
    initials = Column(String(8), nullable=False, default="")
    color = Column(String(16), nullable=False, default="#737373")
    source = Column(String(64), nullable=False, default="seed", index=True)
    external_id = Column(String(128), nullable=False, default="")
    active = Column(Boolean, nullable=False, default=True)
    synced_at = Column(DateTime, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
