from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class ProjectOut(BaseModel):
    id: uuid.UUID
    board_id: uuid.UUID
    name: str
    description: str | None = None


class ProjectCreate(BaseModel):
    board_id: uuid.UUID
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=1000)

