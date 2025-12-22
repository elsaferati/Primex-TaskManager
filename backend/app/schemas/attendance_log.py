from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import AttendanceType


class AttendanceLogOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    date: date
    type: AttendanceType
    details: str | None = None
    created_at: datetime


class AttendanceLogCreate(BaseModel):
    user_id: uuid.UUID | None = None
    date: date
    type: AttendanceType
    details: str | None = None

