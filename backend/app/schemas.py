"""Pydantic schemas for zy-project-board backend."""
from datetime import datetime, timezone
from typing import Annotated, List, Optional

from pydantic import BaseModel, Field, PlainSerializer, WithJsonSchema


def _utc_iso(dt: datetime | None) -> str | None:
    """Serialize a datetime as ISO 8601 with an explicit UTC offset.

    Rows are written with naive ``datetime.utcnow()`` (i.e. UTC without
    tzinfo); SQLite round-trips them naive as well. Serializing them
    bare (``2026-11-23T06:34:00``) makes browsers parse the value as
    *local* time, which shifted every relative timestamp by the viewer's
    UTC offset (8h in CST). Treat naive values as UTC and always emit
    the ``+00:00`` suffix so clients parse them correctly.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# The values are still ISO 8601 date-time strings (now always with an
# offset), so the JSON schema keeps format: date-time — only the
# runtime serialization changes.
UtcDateTime = Annotated[
    datetime,
    PlainSerializer(_utc_iso, return_type=str),
    WithJsonSchema({'type': 'string', 'format': 'date-time'}),
]
UtcDateTimeOpt = Annotated[
    Optional[datetime],
    PlainSerializer(_utc_iso, return_type=str),
    WithJsonSchema(
        {'anyOf': [{'type': 'string', 'format': 'date-time'}, {'type': 'null'}]}
    ),
]


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
    synced_at: UtcDateTimeOpt = None


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
    created_at: UtcDateTime


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
    created_at: UtcDateTime
    updated_at: UtcDateTime
    completed_at: UtcDateTimeOpt = None
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
    created_at: UtcDateTime

    model_config = {"from_attributes": True}


class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    description: str = ""
    ticket_id: Optional[int] = None
    actor_name: Optional[str] = None
    is_read: bool
    created_at: UtcDateTime

    model_config = {"from_attributes": True}


class UnreadCountOut(BaseModel):
    unread: int


class MarkAllReadOut(BaseModel):
    ok: bool = True
    marked: int


class UploadOut(BaseModel):
    """Response of POST /api/uploads: the public path of the stored image."""

    url: str


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
