from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


QuestionStatusValue = Literal["DONE", "X", "O"]


class QuestionCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class QuestionCategoryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class QuestionDefinitionCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    guidance: str | None = Field(default=None, max_length=2000)


class QuestionDefinitionUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    guidance: str | None = Field(default=None, max_length=2000)
    sort_order: int = Field(ge=0)


class QuestionStatusUpdate(BaseModel):
    status: QuestionStatusValue | None


class QuestionStatusSummary(BaseModel):
    user_id: uuid.UUID
    full_name: str
    status: QuestionStatusValue
    updated_at: datetime


class QuestionStatusHistoryOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    full_name: str
    status: QuestionStatusValue | None
    created_at: datetime


class QuestionDefinitionOut(BaseModel):
    id: uuid.UUID
    category_id: uuid.UUID
    text: str
    guidance: str | None
    sort_order: int
    current_user_status: QuestionStatusValue | None
    statuses: list[QuestionStatusSummary]
    created_at: datetime
    updated_at: datetime


class QuestionCategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    sort_order: int
    questions: list[QuestionDefinitionOut]
    created_at: datetime
    updated_at: datetime
