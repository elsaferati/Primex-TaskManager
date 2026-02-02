from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class MeetingOut(BaseModel):
    id: uuid.UUID
    title: str
    platform: str | None = None
    starts_at: datetime | None = None
    meeting_url: str | None = None
    recurrence_type: str | None = None
    recurrence_days_of_week: list[int] | None = None
    recurrence_days_of_month: list[int] | None = None
    department_id: uuid.UUID
    project_id: uuid.UUID | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    participant_ids: list[uuid.UUID] = []


class MeetingCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    platform: str | None = None
    starts_at: datetime | None = None
    meeting_url: str | None = None
    recurrence_type: str | None = None
    recurrence_days_of_week: list[int] | None = None
    recurrence_days_of_month: list[int] | None = None
    department_id: uuid.UUID
    project_id: uuid.UUID | None = None
    participant_ids: list[uuid.UUID] = []


class MeetingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    platform: str | None = None
    starts_at: datetime | None = None
    meeting_url: str | None = None
    recurrence_type: str | None = None
    recurrence_days_of_week: list[int] | None = None
    recurrence_days_of_month: list[int] | None = None
    project_id: uuid.UUID | None = None
    participant_ids: list[uuid.UUID] | None = None