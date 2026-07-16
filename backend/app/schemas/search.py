from __future__ import annotations

import uuid

from pydantic import BaseModel


class SearchTaskResult(BaseModel):
    id: uuid.UUID
    title: str
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None


class SearchProjectResult(BaseModel):
    id: uuid.UUID
    title: str
    department_id: uuid.UUID | None = None


class SearchResponse(BaseModel):
    tasks: list[SearchTaskResult]
    projects: list[SearchProjectResult]


