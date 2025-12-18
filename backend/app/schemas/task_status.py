from __future__ import annotations

import uuid

from pydantic import BaseModel


class TaskStatusOut(BaseModel):
    id: uuid.UUID
    department_id: uuid.UUID
    name: str
    position: int
    is_done: bool

