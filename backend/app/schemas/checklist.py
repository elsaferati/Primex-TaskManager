from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ChecklistOut(BaseModel):
    id: uuid.UUID
    title: str | None = None
    task_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    created_at: datetime


class ChecklistCreate(BaseModel):
    title: str | None = Field(default=None, max_length=150)
    task_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None

