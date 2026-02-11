from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class WeeklySnapshotType(str, Enum):
    PLANNED = "PLANNED"
    FINAL = "FINAL"


class WeeklySnapshotSaveMode(str, Enum):
    THIS_WEEK_FINAL = "THIS_WEEK_FINAL"
    NEXT_WEEK_PLANNED = "NEXT_WEEK_PLANNED"


class WeeklySnapshotSaveRequest(BaseModel):
    department_id: uuid.UUID
    mode: WeeklySnapshotSaveMode


class WeeklySnapshotCreateRequest(BaseModel):
    department_id: uuid.UUID
    week_start: date
    snapshot_type: WeeklySnapshotType = WeeklySnapshotType.PLANNED


class WeeklySnapshotVersionOut(BaseModel):
    id: uuid.UUID
    department_id: uuid.UUID
    week_start_date: date
    week_end_date: date
    snapshot_type: WeeklySnapshotType
    created_by: uuid.UUID | None = None
    created_at: datetime
    is_official: bool = False


class WeeklySnapshotOut(WeeklySnapshotVersionOut):
    payload: dict


class WeeklySnapshotSaveResponse(BaseModel):
    snapshot: WeeklySnapshotVersionOut
    version_count: int
    official_snapshot_id: uuid.UUID


class WeeklySnapshotLatestOut(BaseModel):
    week_start: date
    week_end: date
    department_id: uuid.UUID
    snapshot_type: WeeklySnapshotType
    snapshot: WeeklySnapshotOut | None = None
    message: str | None = None


class WeeklySnapshotOverviewWeekOut(BaseModel):
    week_start: date
    week_end: date
    label: str
    planned_official_id: uuid.UUID | None = None
    planned_versions: int = 0
    final_official_id: uuid.UUID | None = None
    final_versions: int = 0


class WeeklySnapshotOverviewOut(BaseModel):
    weeks: list[WeeklySnapshotOverviewWeekOut]


class WeeklySnapshotCompareOut(BaseModel):
    week_start: date
    week_end: date
    planned_official: WeeklySnapshotOut | None = None
    final_official: WeeklySnapshotOut | None = None
    planned_versions: list[WeeklySnapshotVersionOut] = Field(default_factory=list)
    final_versions: list[WeeklySnapshotVersionOut] = Field(default_factory=list)


class WeeklySnapshotTaskAssigneeOut(BaseModel):
    assignee_id: uuid.UUID | None = None
    assignee_name: str


class WeeklySnapshotTaskOccurrenceOut(BaseModel):
    day: date | None = None
    time_slot: str | None = None
    assignee_id: uuid.UUID | None = None
    assignee_name: str | None = None


class WeeklySnapshotCompareTaskOut(BaseModel):
    match_key: str
    task_id: uuid.UUID | None = None
    fallback_key: str | None = None
    title: str
    project_id: uuid.UUID | None = None
    project_title: str | None = None
    source_type: str
    status: str | None = None
    daily_status: str | None = None
    completed_at: datetime | None = None
    is_completed: bool = False
    finish_period: str | None = None
    priority: str | None = None
    tags: list[str] = Field(default_factory=list)
    assignees: list[WeeklySnapshotTaskAssigneeOut] = Field(default_factory=list)
    occurrences: list[WeeklySnapshotTaskOccurrenceOut] = Field(default_factory=list)


class WeeklySnapshotCompareSummaryOut(BaseModel):
    total_planned: int = 0
    completed: int = 0
    in_progress: int = 0
    pending: int = 0
    late: int = 0
    additional: int = 0
    not_completed: int = 0
    added_during_week: int = 0
    removed_or_canceled: int = 0


class WeeklySnapshotCompareAssigneeGroupOut(BaseModel):
    assignee_id: uuid.UUID | None = None
    assignee_name: str
    completed: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    in_progress: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    pending: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    late: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    additional: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    not_completed: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    added_during_week: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    removed_or_canceled: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)


class WeeklySnapshotPlanVsActualOut(BaseModel):
    week_start: date
    week_end: date
    department_id: uuid.UUID
    department_name: str | None = None
    snapshot_id: uuid.UUID | None = None
    snapshot_created_at: datetime | None = None
    snapshot_created_by: uuid.UUID | None = None
    final_snapshot_id: uuid.UUID | None = None
    final_snapshot_created_at: datetime | None = None
    final_snapshot_created_by: uuid.UUID | None = None
    message: str | None = None
    summary: WeeklySnapshotCompareSummaryOut
    completed: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    in_progress: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    pending: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    late: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    additional: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    not_completed: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    added_during_week: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    removed_or_canceled: list[WeeklySnapshotCompareTaskOut] = Field(default_factory=list)
    by_assignee: list[WeeklySnapshotCompareAssigneeGroupOut] = Field(default_factory=list)
