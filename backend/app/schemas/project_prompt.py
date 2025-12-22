from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import PromptType


class ProjectPromptOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    type: PromptType
    content: str
    created_at: datetime


class ProjectPromptCreate(BaseModel):
    project_id: uuid.UUID
    type: PromptType
    content: str

