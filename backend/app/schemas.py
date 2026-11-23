"""Pydantic schemas for zy-project-board backend."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: str
    name: str
    initials: str
    color: str
    avatar_url: str = ""
    email: str = ""
    role: str = ""
    source: str = "seed"
    external_id: str = ""
    active: bool = True
    synced_at: Optional[datetime] = None


class AuthRegister(BaseModel):
    name: str
    email: str
    password: str


class AuthLogin(BaseModel):
    email: str
    password: str


class AuthUserOut(BaseModel):
    id: int
    name: str
    email: str
    created_at: datetime


class AuthOut(BaseModel):
    token: str
    user: AuthUserOut


class UpdateMe(BaseModel):
    name: str


class ChangePassword(BaseModel):
    current_password: str
    new_password: str


class UserSyncItem(BaseModel):
    external_id: str
    name: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


class UserSyncIn(BaseModel):
    source: str
    users: List[UserSyncItem] = []


class UserSyncError(BaseModel):
    index: int
    external_id: Optional[str] = None
    error: str


class UserSyncOut(BaseModel):
    created: int
    updated: int
    deactivated: int
    errors: List[UserSyncError] = []


class ProjectOut(BaseModel):
    id: str
    name: str


class TicketBase(BaseModel):
    title: str
    description: str = ""
    category: str = ""
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
    category: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    project_id: Optional[str] = None
    assignee_ids: Optional[List[str]] = None
    position: Optional[int] = None


class TicketOut(BaseModel):
    id: int
    code: str
    category: str = ""
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
