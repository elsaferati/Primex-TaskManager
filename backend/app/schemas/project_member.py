from __future__ import annotations

import uuid

from pydantic import BaseModel


class ProjectMemberOut(BaseModel):
    project_id: uuid.UUID
    user_id: uuid.UUID


class ProjectMemberCreate(BaseModel):
    project_id: uuid.UUID
    user_id: uuid.UUID

