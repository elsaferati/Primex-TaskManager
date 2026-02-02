from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ProjectPhaseChecklistItemOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    phase_key: str
    title: str
    comment: str | None = None
    is_checked: bool
    sort_order: int | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class ProjectPhaseChecklistItemCreate(BaseModel):
    title: str = Field(..., min_length=1)
    comment: str | None = None


class ProjectPhaseChecklistItemUpdate(BaseModel):
    title: str | None = None
    comment: str | None = None
    is_checked: bool | None = None
    sort_order: int | None = None
