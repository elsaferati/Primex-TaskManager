from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import ProjectPhaseStatus, TaskFinishPeriod, TaskPriority, TaskStatus


class TaskAssigneeOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str | None = None
    full_name: str | None = None


class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    internal_notes: str | None = None
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    assigned_to: uuid.UUID | None = None
    assignees: list[TaskAssigneeOut] = Field(default_factory=list)
    created_by: uuid.UUID | None = None
    ga_note_origin_id: uuid.UUID | None = None
    system_template_origin_id: uuid.UUID | None = None
    status: TaskStatus
    priority: TaskPriority
    finish_period: TaskFinishPeriod | None = None
    phase: ProjectPhaseStatus
    progress_percentage: int
    start_date: datetime | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    is_bllok: bool
    is_1h_report: bool
    is_r1: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str | None = Field(default=None)
    internal_notes: str | None = None
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = Field(default=None)
    assigned_to: uuid.UUID | None = None
    assignees: list[uuid.UUID] | None = None
    ga_note_origin_id: uuid.UUID | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    finish_period: TaskFinishPeriod | None = None
    phase: ProjectPhaseStatus | None = None
    progress_percentage: int | None = Field(default=None, ge=0, le=100)
    start_date: datetime | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    is_bllok: bool | None = None
    is_1h_report: bool | None = None
    is_r1: bool | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None)
    internal_notes: str | None = None
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    assigned_to: uuid.UUID | None = None
    assignees: list[uuid.UUID] | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    finish_period: TaskFinishPeriod | None = None
    phase: ProjectPhaseStatus | None = None
    progress_percentage: int | None = Field(default=None, ge=0, le=100)
    start_date: datetime | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    is_bllok: bool | None = None
    is_1h_report: bool | None = None
    is_r1: bool | None = None

