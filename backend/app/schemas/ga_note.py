from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class GaNoteOut(BaseModel):
    id: uuid.UUID
    content: str
    created_by: uuid.UUID | None = None
    start_date: datetime
    due_date: datetime | None = None
    completed_at: datetime | None = None
    is_converted_to_task: bool
    project_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class GaNoteCreate(BaseModel):
    content: str
    created_by: uuid.UUID | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    is_converted_to_task: bool | None = None
    project_id: uuid.UUID | None = None

