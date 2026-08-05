from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class StdFeedbackTicketOut(BaseModel):
    id: uuid.UUID
    external_id: str
    issue_number: int | None = None
    order_ticket_number: str | None = None
    title: str | None = None
    description: str | None = None
    affected_fields: list[str] = Field(default_factory=list)
    category: str | None = None
    priority: str | None = None
    status: str | None = None
    dashboard_area: str | None = None
    reporter_username: str | None = None
    reporter_email: str | None = None
    comment_count: int = 0
    file_count: int = 0
    reported_at: datetime | None = None
    source_updated_at: datetime | None = None
    closed_at: datetime | None = None
    synced_at: datetime
    review_status: str
    review_note: str | None = None
    reviewed_by: uuid.UUID | None = None
    reviewed_at: datetime | None = None
    ga_note_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    source: Literal["STD External"] = "STD External"


class StdFeedbackTicketDetailOut(StdFeedbackTicketOut):
    creator_id: str | None = None
    assigned_admin: str | None = None
    closed_by: str | None = None
    related_order_id: str | None = None
    order_snapshot_json: dict[str, Any] = Field(default_factory=dict)
    comments: list[dict[str, Any]] = Field(default_factory=list)
    files: list[dict[str, Any]] = Field(default_factory=list)


class StdFeedbackTicketListOut(BaseModel):
    items: list[StdFeedbackTicketOut]
    total: int
    page: int
    page_size: int
    pages: int
    categories: list[str] = Field(default_factory=list)
    priorities: list[str] = Field(default_factory=list)
    statuses: list[str] = Field(default_factory=list)
    last_synchronized_at: datetime | None = None
    last_sync_error: str | None = None


class StdFeedbackSyncOut(BaseModel):
    ok: bool
    synced: int = 0
    pages: int = 0
    initial_sync: bool | None = None
    reason: str | None = None


class StdTicketProjectOption(BaseModel):
    id: uuid.UUID
    title: str
    department_id: uuid.UUID | None = None


class StdTicketUserOption(BaseModel):
    id: uuid.UUID
    label: str
    department_id: uuid.UUID | None = None


class StdTicketTaskOptionsOut(BaseModel):
    projects: list[StdTicketProjectOption]
    users: list[StdTicketUserOption]


class StdTicketNoActionRequest(BaseModel):
    ticket_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=2000)


class StdTicketNoActionOut(BaseModel):
    updated: int


class StdTicketCreateTaskRequest(BaseModel):
    ticket_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    project_id: uuid.UUID
    assignee_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)
    title: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=10000)
    review_note: str | None = Field(default=None, max_length=2000)
    priority: Literal["NORMAL", "HIGH", "1H", "R1", "PERSONAL", "BLLOK"] = "1H"
    start_date: datetime | None = None
    due_date: datetime | None = None


class StdTicketCreateTaskOut(BaseModel):
    note_id: uuid.UUID
    task_ids: list[uuid.UUID]
    ticket_ids: list[uuid.UUID]
    created: bool
