from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import TaskType


class TaskOut(BaseModel):
    id: uuid.UUID
    department_id: uuid.UUID
    board_id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str | None = None
    task_type: TaskType
    status_id: uuid.UUID
    position: int
    assigned_to_user_id: uuid.UUID | None = None
    planned_for: date | None = None
    is_carried_over: bool
    carried_over_from: date | None = None
    is_milestone: bool
    reminder_enabled: bool
    next_reminder_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class TaskCreate(BaseModel):
    project_id: uuid.UUID
    title: str = Field(min_length=2, max_length=300)
    description: str | None = Field(default=None, max_length=8000)
    status_id: uuid.UUID
    task_type: TaskType = TaskType.adhoc
    position: int = 0
    assigned_to_user_id: uuid.UUID | None = None
    planned_for: date | None = None
    is_milestone: bool = False
    reminder_enabled: bool = False


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=300)
    description: str | None = Field(default=None, max_length=8000)
    status_id: uuid.UUID | None = None
    position: int | None = None
    assigned_to_user_id: uuid.UUID | None = None
    planned_for: date | None = None
    is_milestone: bool | None = None
    reminder_enabled: bool | None = None


class TaskMove(BaseModel):
    status_id: uuid.UUID
    position: int

