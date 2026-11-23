"""Pydantic schemas for zy-project-board backend."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: str
    name: str
    initials: str
    color: str


class ProjectOut(BaseModel):
    id: str
    name: str


class TicketBase(BaseModel):
    title: str
    description: str = ""
    status: str = "todo"
    priority: str = "low"
    project_id: str = "p-boardui"
    assignee_ids: List[str] = []


class TicketCreate(TicketBase):
    # Optional code prefix: DS | FE | BE. Defaults to "FE" when omitted.
    prefix: Optional[str] = None


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    project_id: Optional[str] = None
    assignee_ids: Optional[List[str]] = None
    position: Optional[int] = None


class TicketOut(BaseModel):
    id: int
    code: str
    title: str
    description: str
    status: str
    priority: str
    project_id: str
    assignee_ids: List[str]
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    position: int

    model_config = {"from_attributes": True}


class CommentCreate(BaseModel):
    author_id: Optional[str] = None
    body: str


class CommentOut(BaseModel):
    id: int
    ticket_id: int
    author_id: str
    author_name: str
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenPoint(BaseModel):
    date: str
    tokens: int


class TokenStatsOut(BaseModel):
    ticket_id: int
    total_tokens: int
    delta_pct: float
    points: List[TokenPoint]


class BoardColumn(BaseModel):
    status: str
    label: str
    count: int
    total: int
    tickets: List[TicketOut]


class BoardOut(BaseModel):
    columns: List[BoardColumn]
