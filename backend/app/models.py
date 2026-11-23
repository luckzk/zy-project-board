"""SQLAlchemy models for zy-project-board backend."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, nullable=False, index=True)
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
