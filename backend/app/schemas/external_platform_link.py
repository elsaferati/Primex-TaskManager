from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ExternalPlatformLinkCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    href: str = Field(min_length=1, max_length=1000)
    description: str | None = Field(default=None, max_length=500)
    sort_order: int = 0
    is_active: bool = True


class ExternalPlatformLinkUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    href: str | None = Field(default=None, min_length=1, max_length=1000)
    description: str | None = Field(default=None, max_length=500)
    sort_order: int | None = None
    is_active: bool | None = None


class ExternalPlatformLinkOut(BaseModel):
    id: uuid.UUID
    label: str
    href: str
    description: str | None
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
