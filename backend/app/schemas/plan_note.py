from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import (
    GaNotePriority,
    GaNoteStatus,
    GaNoteType,
    TaskFinishPeriod,
    TaskPriority,
    TaskStatus,
)


class PlanNoteAttachmentOut(BaseModel):
    id: uuid.UUID
    note_id: uuid.UUID
    original_filename: str
    stored_filename: str
    content_type: str | None = None
    size_bytes: int
    created_by: uuid.UUID | None = None
    created_at: datetime


class PlanNoteOut(BaseModel):
    id: uuid.UUID
    content: str
    comment: str | None = None
    created_by: uuid.UUID | None = None
    note_type: GaNoteType
    status: GaNoteStatus
    priority: GaNotePriority | None = None
    start_date: datetime
    due_date: datetime | None = None
    completed_at: datetime | None = None
    is_converted_to_task: bool
    is_discussed: bool = False
    next_week: bool = False
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    planned_for_date: date | None = None
    created_at: datetime
    updated_at: datetime
    attachments: list[PlanNoteAttachmentOut] = []


class PlanNoteCreate(BaseModel):
    content: str
    comment: str | None = None
    created_by: uuid.UUID | None = None
    note_type: GaNoteType | None = None
    status: GaNoteStatus | None = None
    priority: GaNotePriority | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    is_converted_to_task: bool | None = None
    is_discussed: bool | None = None
    next_week: bool | None = None
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    planned_for_date: date | None = None


class PlanNoteUpdate(BaseModel):
    content: str | None = None
    comment: str | None = None
    status: GaNoteStatus | None = None
    priority: GaNotePriority | None = None
    is_converted_to_task: bool | None = None
    is_discussed: bool | None = None
    next_week: bool | None = None
    planned_for_date: date | None = None


class PlanNoteTaskDeadlineUpdate(BaseModel):
    due_date: datetime | None = None
    is_deadline_important: bool | None = None
    clear: bool = False


class PlanNoteTaskAssigneeStateUpdate(BaseModel):
    assignee_id: uuid.UUID
    status: TaskStatus
    confirmation_assignee_id: uuid.UUID | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    finish_period: TaskFinishPeriod | None = None
    is_deadline_important: bool = False
    priority: TaskPriority = TaskPriority.NORMAL
    is_bllok: bool = False
    is_1h_report: bool = False
    is_r1: bool = False
    is_personal: bool = False


class PlanNoteTaskBundleUpdate(BaseModel):
    content: str | None = None
    description: str | None = None
    project_id: uuid.UUID | None = None
    assignee_ids: list[uuid.UUID] | None = None
    assignee_states: list[PlanNoteTaskAssigneeStateUpdate] | None = None
    expected_updated_at: datetime | None = None


class PlanNoteTaskBundleResponse(BaseModel):
    note: PlanNoteOut
    active_task_ids: list[uuid.UUID]
    assignee_ids: list[uuid.UUID]
    created_count: int = 0
    deactivated_count: int = 0
    deduplicated_count: int = 0
    updated_count: int = 0
