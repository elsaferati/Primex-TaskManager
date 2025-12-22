from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.models.audit_log import AuditLog


def add_audit_log(
    *,
    db,
    actor_user_id: uuid.UUID | None,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    before: dict | None = None,
    after: dict | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        before=before,
        after=after,
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    return entry


