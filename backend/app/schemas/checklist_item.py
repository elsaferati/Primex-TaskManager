from __future__ import annotations

import uuid

from pydantic import BaseModel


class ChecklistItemOut(BaseModel):
    id: uuid.UUID
    checklist_id: uuid.UUID | None = None
    content: str
    is_checked: bool
    position: int


class ChecklistItemCreate(BaseModel):
    checklist_id: uuid.UUID | None = None
    content: str
    is_checked: bool | None = None
    position: int | None = None

