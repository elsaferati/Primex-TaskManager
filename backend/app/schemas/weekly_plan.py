from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel


class WeeklyPlanOut(BaseModel):
    id: uuid.UUID
    department_id: uuid.UUID | None = None
    start_date: date
    end_date: date
    content: dict | None = None
    is_finalized: bool
    created_by: uuid.UUID | None = None
    created_at: datetime


class WeeklyPlanCreate(BaseModel):
    department_id: uuid.UUID | None = None
    start_date: date
    end_date: date
    content: dict | None = None
    is_finalized: bool | None = None
    created_by: uuid.UUID | None = None

