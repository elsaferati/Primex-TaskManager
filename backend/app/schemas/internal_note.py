from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class InternalNoteOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    department_id: uuid.UUID
    project_id: uuid.UUID | None
    to_department_id: uuid.UUID
    is_done: bool
    done_at: datetime | None
    done_by_user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class InternalNoteCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str
    description: str | None = None
    department_id: uuid.UUID | None = Field(default=None, alias="departmentId")
    project_id: uuid.UUID | None = Field(default=None, alias="projectId")
    to_user_id: uuid.UUID | None = Field(default=None, alias="toUserId")
    to_user_ids: list[uuid.UUID] | None = Field(default=None, alias="toUserIds")


class InternalNoteDoneUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    is_done: bool = Field(alias="isDone")
