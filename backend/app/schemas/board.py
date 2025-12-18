from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class BoardOut(BaseModel):
    id: uuid.UUID
    department_id: uuid.UUID
    name: str
    description: str | None = None


class BoardCreate(BaseModel):
    department_id: uuid.UUID
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class BoardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=1000)

