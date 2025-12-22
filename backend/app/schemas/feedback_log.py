from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import FeedbackType


class FeedbackLogOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    title: str | None = None
    content: str
    type: FeedbackType
    created_at: datetime


class FeedbackLogCreate(BaseModel):
    user_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=200)
    content: str
    type: FeedbackType

