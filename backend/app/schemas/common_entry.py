from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import CommonApprovalStatus, CommonCategory


class CommonEntryOut(BaseModel):
    id: uuid.UUID
    category: CommonCategory
    title: str
    description: str | None = None
    entry_date: date | None = None
    created_by_user_id: uuid.UUID
    assigned_to_user_id: uuid.UUID | None = None
    approval_status: CommonApprovalStatus
    approved_by_user_id: uuid.UUID | None = None
    approved_at: datetime | None = None
    rejected_by_user_id: uuid.UUID | None = None
    rejected_at: datetime | None = None
    rejection_reason: str | None = None
    generated_task_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class CommonEntryCreate(BaseModel):
    category: CommonCategory
    title: str = Field(min_length=2, max_length=300)
    description: str | None = Field(default=None, max_length=8000)
    entry_date: date | None = None
    assigned_to_user_id: uuid.UUID | None = None


class CommonEntryAssign(BaseModel):
    assigned_to_user_id: uuid.UUID | None = None


class CommonEntryApprove(BaseModel):
    create_task: bool = False
    project_id: uuid.UUID | None = None
    status_id: uuid.UUID | None = None
    assigned_to_user_id: uuid.UUID | None = None


class CommonEntryReject(BaseModel):
    reason: str = Field(min_length=2, max_length=1000)


