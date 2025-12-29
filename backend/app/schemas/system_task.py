from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import FrequencyType, TaskFinishPeriod, TaskPriority
from app.schemas.task import TaskAssigneeOut


class SystemTaskOut(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    title: str
    description: str | None = None
    internal_notes: str | None = None
    department_id: uuid.UUID | None = None
    default_assignee_id: uuid.UUID | None = None
    assignees: list[TaskAssigneeOut] = Field(default_factory=list)
    frequency: FrequencyType
    day_of_week: int | None = None
    day_of_month: int | None = None
    month_of_year: int | None = None
    priority: TaskPriority
    finish_period: TaskFinishPeriod | None = None
    is_active: bool
    created_at: datetime
