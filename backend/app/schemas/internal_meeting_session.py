from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel


class InternalMeetingSessionEnsure(BaseModel):
    checklist_id: uuid.UUID


class InternalMeetingSessionOut(BaseModel):
    session_id: uuid.UUID
    checklist_id: uuid.UUID
    session_date: date
    starts_at: datetime
    ends_at: datetime
    reset_at: datetime | None = None
