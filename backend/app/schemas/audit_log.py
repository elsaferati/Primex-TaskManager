from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: uuid.UUID
    actor_user_id: uuid.UUID | None = None
    entity_type: str
    entity_id: uuid.UUID
    action: str
    before: dict | None = None
    after: dict | None = None
    created_at: datetime

