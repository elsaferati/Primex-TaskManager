from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import TemplateRecurrence


class TaskTemplateOut(BaseModel):
    id: uuid.UUID
    department_id: uuid.UUID
    board_id: uuid.UUID
    project_id: uuid.UUID | None = None
    title: str
    description: str | None = None
    recurrence: TemplateRecurrence
    default_status_id: uuid.UUID
    assigned_to_user_id: uuid.UUID | None = None
    created_by_user_id: uuid.UUID | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TaskTemplateCreate(BaseModel):
    board_id: uuid.UUID
    project_id: uuid.UUID | None = None
    title: str = Field(min_length=2, max_length=300)
    description: str | None = Field(default=None, max_length=4000)
    recurrence: TemplateRecurrence
    default_status_id: uuid.UUID
    assigned_to_user_id: uuid.UUID | None = None
    is_active: bool = True


class TaskTemplateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=300)
    description: str | None = Field(default=None, max_length=4000)
    recurrence: TemplateRecurrence | None = None
    default_status_id: uuid.UUID | None = None
    assigned_to_user_id: uuid.UUID | None = None
    is_active: bool | None = None

