from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import GaNotePriority, GaNoteStatus, GaNoteType


class PlanNoteAttachmentOut(BaseModel):
    id: uuid.UUID
    note_id: uuid.UUID
    original_filename: str
    stored_filename: str
    content_type: str | None = None
    size_bytes: int
    created_by: uuid.UUID | None = None
    created_at: datetime


class PlanNoteOut(BaseModel):
    id: uuid.UUID
    content: str
    created_by: uuid.UUID | None = None
    note_type: GaNoteType
    status: GaNoteStatus
    priority: GaNotePriority | None = None
    start_date: datetime
    due_date: datetime | None = None
    completed_at: datetime | None = None
    is_converted_to_task: bool
    is_discussed: bool = False
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    planned_for_date: date | None = None
    created_at: datetime
    updated_at: datetime
    attachments: list[PlanNoteAttachmentOut] = []


class PlanNoteCreate(BaseModel):
    content: str
    created_by: uuid.UUID | None = None
    note_type: GaNoteType | None = None
    status: GaNoteStatus | None = None
    priority: GaNotePriority | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    is_converted_to_task: bool | None = None
    is_discussed: bool | None = None
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    planned_for_date: date | None = None


class PlanNoteUpdate(BaseModel):
    content: str | None = None
    status: GaNoteStatus | None = None
    priority: GaNotePriority | None = None
    is_converted_to_task: bool | None = None
    is_discussed: bool | None = None
    planned_for_date: date | None = None


class PlanNoteTaskDeadlineUpdate(BaseModel):
    due_date: datetime | None = None
    is_deadline_important: bool | None = None
    clear: bool = False
