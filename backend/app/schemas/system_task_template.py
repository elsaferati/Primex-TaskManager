from __future__ import annotations

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, Field

from app.models.enums import FrequencyType, SystemTaskScope, TaskFinishPeriod, TaskPriority


class SystemTaskTemplateOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    internal_notes: str | None = None
    department_id: uuid.UUID | None = None
    default_assignee_id: uuid.UUID | None = None
    assignee_ids: list[uuid.UUID] | None = None
    scope: SystemTaskScope
    frequency: FrequencyType
    day_of_week: int | None = None
    days_of_week: list[int] | None = None
    day_of_month: int | None = None
    month_of_year: int | None = None
    timezone: str | None = None
    start_at: datetime | None = None
    due_time: time | None = None
    interval: int | None = None
    lookahead_days: int | None = None
    recurrence_kind: str | None = None
    byweekday: list[int] | None = None
    bymonthday: int | None = None
    effective_from: date | None = None
    effective_to: date | None = None
    priority: TaskPriority | None = None
    finish_period: TaskFinishPeriod | None = None
    requires_alignment: bool = False
    alignment_time: time | None = None
    alignment_roles: list[str] | None = None
    alignment_user_ids: list[uuid.UUID] | None = None
    is_active: bool
    created_at: datetime


class SystemTaskTemplateCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = None
    internal_notes: str | None = None
    department_id: uuid.UUID | None = None
    default_assignee_id: uuid.UUID | None = None
    assignee_ids: list[uuid.UUID] | None = None
    scope: SystemTaskScope | None = None
    frequency: FrequencyType
    day_of_week: int | None = None
    days_of_week: list[int] | None = None
    day_of_month: int | None = None
    month_of_year: int | None = None
    timezone: str | None = None
    start_at: datetime | None = None
    due_time: time | None = None
    interval: int | None = None
    lookahead_days: int | None = None
    recurrence_kind: str | None = None
    byweekday: list[int] | None = None
    bymonthday: int | None = None
    effective_from: date | None = None
    effective_to: date | None = None
    priority: TaskPriority | None = None
    finish_period: TaskFinishPeriod | None = None
    requires_alignment: bool | None = None
    alignment_time: time | None = None
    alignment_roles: list[str] | None = None
    alignment_user_ids: list[uuid.UUID] | None = None
    is_active: bool | None = None


class SystemTaskTemplateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = None
    internal_notes: str | None = None
    department_id: uuid.UUID | None = None
    default_assignee_id: uuid.UUID | None = None
    assignee_ids: list[uuid.UUID] | None = None
    scope: SystemTaskScope | None = None
    frequency: FrequencyType | None = None
    day_of_week: int | None = None
    days_of_week: list[int] | None = None
    day_of_month: int | None = None
    month_of_year: int | None = None
    timezone: str | None = None
    start_at: datetime | None = None
    due_time: time | None = None
    interval: int | None = None
    lookahead_days: int | None = None
    recurrence_kind: str | None = None
    byweekday: list[int] | None = None
    bymonthday: int | None = None
    effective_from: date | None = None
    effective_to: date | None = None
    priority: TaskPriority | None = None
    finish_period: TaskFinishPeriod | None = None
    requires_alignment: bool | None = None
    alignment_time: time | None = None
    alignment_roles: list[str] | None = None
    alignment_user_ids: list[uuid.UUID] | None = None
    is_active: bool | None = None

