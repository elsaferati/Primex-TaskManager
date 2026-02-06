from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.task import TaskOut
from app.models.enums import GaNotePriority, GaNoteStatus, GaNoteType


class DailyReportTaskItem(BaseModel):
    task: TaskOut
    project_title: str | None = None
    planned_start: date | None = None
    planned_end: date | None = None
    original_planned_end: date | None = None
    is_overdue: bool
    late_days: int | None = None


class DailyReportSystemOccurrence(BaseModel):
    template_id: uuid.UUID
    title: str
    frequency: str | None = None
    department_id: uuid.UUID | None = None
    scope: str | None = None
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


class DailyReportGaEntryOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    department_id: uuid.UUID
    entry_date: date
    content: str
    created_at: datetime
    updated_at: datetime


class DailyReportGaEntryUpsert(BaseModel):
    day: date
    department_id: uuid.UUID
    content: str
    user_id: uuid.UUID | None = None


class DailyReportGaNoteOut(BaseModel):
    id: uuid.UUID
    content: str
    note_type: GaNoteType
    status: GaNoteStatus
    priority: GaNotePriority | None = None
    created_at: datetime
    project_id: uuid.UUID | None = None
    project_name: str | None = None


class DailyReportGaTableResponse(BaseModel):
    entry: DailyReportGaEntryOut | None = None
    notes: list[DailyReportGaNoteOut]

