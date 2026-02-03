from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import GaNotePriority, GaNoteStatus, GaNoteType

class GaNoteOut(BaseModel):
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
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class GaNoteCreate(BaseModel):
    content: str
    created_by: uuid.UUID | None = None
    note_type: GaNoteType | None = None
    status: GaNoteStatus | None = None
    priority: GaNotePriority | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    is_converted_to_task: bool | None = None
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None


class GaNoteUpdate(BaseModel):
    content: str | None = None
    status: GaNoteStatus | None = None
    priority: GaNotePriority | None = None
    is_converted_to_task: bool | None = None

