from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class MicrosoftEvent(BaseModel):
    id: str
    subject: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location: str | None = None
    is_all_day: bool = False
    organizer: str | None = None
    body_preview: str | None = None
