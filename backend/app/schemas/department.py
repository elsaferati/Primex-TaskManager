from __future__ import annotations

import uuid

from pydantic import BaseModel


class DepartmentOut(BaseModel):
    id: uuid.UUID
    name: str

