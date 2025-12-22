from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import HolidayType


class HolidayOut(BaseModel):
    id: uuid.UUID
    title: str
    date: date
    type: HolidayType
    country_code: str | None = None
    created_at: datetime


class HolidayCreate(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    date: date
    type: HolidayType
    country_code: str | None = Field(default=None, max_length=5)

