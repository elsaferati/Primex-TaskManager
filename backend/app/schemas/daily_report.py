from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.task import TaskOut


class DailyReportTaskItem(BaseModel):
    task: TaskOut
    planned_start: date | None = None
    planned_end: date | None = None
    original_planned_end: date | None = None
    is_overdue: bool
    late_days: int | None = None


class DailyReportSystemOccurrence(BaseModel):
    template_id: uuid.UUID
    title: str
    occurrence_date: date
    status: str
    comment: str | None = None
    acted_at: datetime | None = None
    is_overdue: bool
    late_days: int | None = None


class DailyReportResponse(BaseModel):
    day: date
    tasks_today: list[DailyReportTaskItem]
    tasks_overdue: list[DailyReportTaskItem]
    system_today: list[DailyReportSystemOccurrence]
    system_overdue: list[DailyReportSystemOccurrence]

