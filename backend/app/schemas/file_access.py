from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator


class FileAccessFolderOut(BaseModel):
    id: int
    fullPath: str | None = None
    relativePath: str | None = None
    folderName: str
    parentFolderId: int | None = None
    isManaged: bool | None = None
    accessGroupName: str | None = None
    hasChildren: bool | None = None


class FileAccessUserMappingOut(BaseModel):
    user_id: uuid.UUID
    full_name: str
    username: str | None = None
    email: str
    sam_account_name: str
    can_approve: bool


class FileAccessRequestCreate(BaseModel):
    folder_id: int | None = None
    folder_path: str | None = Field(default=None, max_length=4000)
    folder_name: str = Field(min_length=1, max_length=500)
    reason: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def require_folder_locator(self) -> "FileAccessRequestCreate":
        if self.folder_id is None and not (self.folder_path or "").strip():
            raise ValueError("folder_id or folder_path is required")
        return self


class FileAccessDecision(BaseModel):
    note: str | None = Field(default=None, max_length=4000)


class FileAccessRemove(BaseModel):
    folder_id: int | None = None
    folder_path: str | None = Field(default=None, max_length=4000)
    sam_account_name: str = Field(min_length=1, max_length=64)

    @model_validator(mode="after")
    def require_folder_locator(self) -> "FileAccessRemove":
        if self.folder_id is None and not (self.folder_path or "").strip():
            raise ValueError("folder_id or folder_path is required")
        return self


class FileAccessRequestOut(BaseModel):
    id: uuid.UUID
    requester_user_id: uuid.UUID
    requester_name: str
    requester_sam_account_name: str
    folder_id: int | None
    folder_path: str | None
    folder_name: str
    reason: str | None
    status: str
    approver_user_id: uuid.UUID | None
    approver_name: str | None
    decision_note: str | None
    decided_at: datetime | None
    created_at: datetime
    updated_at: datetime


class FileAccessAccessOut(BaseModel):
    items: list[dict[str, Any]]
