from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.checklist_item import ChecklistItemOut


class ChecklistColumn(BaseModel):
    key: str
    label: str
    width: str | None = None


class ChecklistOut(BaseModel):
    id: uuid.UUID
    title: str | None = None
    task_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    note: str | None = None
    default_owner: str | None = None
    default_time: str | None = None
    group_key: str | None = None
    columns: list[ChecklistColumn] | None = None
    position: int | None = None
    created_at: datetime


class ChecklistCreate(BaseModel):
    title: str | None = Field(default=None, max_length=150)
    task_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    note: str | None = None
    default_owner: str | None = None
    default_time: str | None = None
    group_key: str | None = None
    columns: list[ChecklistColumn] | None = None
    position: int | None = None


class ChecklistWithItemsOut(ChecklistOut):
    items: list[ChecklistItemOut] = []

