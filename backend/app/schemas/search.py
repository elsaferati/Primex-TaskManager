from __future__ import annotations

import uuid

from pydantic import BaseModel


class SearchTaskResult(BaseModel):
    id: uuid.UUID
    title: str
    project_id: uuid.UUID
    department_id: uuid.UUID


class SearchProjectResult(BaseModel):
    id: uuid.UUID
    name: str
    board_id: uuid.UUID


class SearchResponse(BaseModel):
    tasks: list[SearchTaskResult]
    projects: list[SearchProjectResult]


