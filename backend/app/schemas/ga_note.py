from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class GaNoteAttachmentOut(BaseModel):
    id: uuid.UUID
    note_id: uuid.UUID
    original_filename: str
    stored_filename: str
    content_type: str | None = None
    size_bytes: int
    created_by: uuid.UUID | None = None
    created_at: datetime

from app.models.enums import GaNotePriority, GaNoteStatus, GaNoteType, TaskFinishPeriod, TaskPriority, TaskStatus

class GaNoteOut(BaseModel):
    id: uuid.UUID
    content: str
    created_by: uuid.UUID | None = None
    note_type: GaNoteType
    status: GaNoteStatus
    priority: GaNotePriority | None = None
    start_date: datetime
    due_date: datetime | None = None
    completed_at: datetime | None = None
    is_converted_to_task: bool
    is_discussed: bool = False
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    attachments: list[GaNoteAttachmentOut] = []


class GaNotePublicOut(BaseModel):
    id: uuid.UUID
    content: str
    note_type: GaNoteType
    status: GaNoteStatus
    created_at: datetime


class GaNoteCreate(BaseModel):
    content: str
    created_by: uuid.UUID | None = None
    note_type: GaNoteType | None = None
    status: GaNoteStatus | None = None
    priority: GaNotePriority | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    is_converted_to_task: bool | None = None
    is_discussed: bool | None = None
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None


class GaNoteUpdate(BaseModel):
    content: str | None = None
    status: GaNoteStatus | None = None
    priority: GaNotePriority | None = None
    is_converted_to_task: bool | None = None
    is_discussed: bool | None = None


class GaNoteTaskDeadlineUpdate(BaseModel):
    start_date: datetime | None = None
    due_date: datetime | None = None
    is_deadline_important: bool | None = None
    clear_start: bool = False
    clear: bool = False


class GaNoteTaskAssigneeStateUpdate(BaseModel):
    """Execution state owned by one independent GA-task assignee copy."""

    assignee_id: uuid.UUID
    status: TaskStatus
    start_date: datetime | None = None
    due_date: datetime | None = None
    finish_period: TaskFinishPeriod | None = None
    is_deadline_important: bool = False
    priority: TaskPriority = TaskPriority.NORMAL
    is_bllok: bool = False
    is_1h_report: bool = False
    is_r1: bool = False
    is_personal: bool = False


class GaNoteTaskBundleUpdate(BaseModel):
    """Atomic update for a GA note and its independent assignee copies."""

    content: str | None = None
    description: str | None = None
    assignee_ids: list[uuid.UUID] | None = None
    assignee_states: list[GaNoteTaskAssigneeStateUpdate] | None = None
    expected_updated_at: datetime | None = None


class GaNoteTaskBundleResponse(BaseModel):
    note: GaNoteOut
    active_task_ids: list[uuid.UUID]
    assignee_ids: list[uuid.UUID]
    created_count: int = 0
    deactivated_count: int = 0
    deduplicated_count: int = 0
    updated_count: int = 0
