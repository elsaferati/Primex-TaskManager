from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.models.enums import RealizationOperatingMode


class DepartmentOut(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    realization_mode: RealizationOperatingMode = RealizationOperatingMode.AUTO


class DepartmentRealizationModeUpdate(BaseModel):
    realization_mode: RealizationOperatingMode

