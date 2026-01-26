from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone

from app.integrations.redis import get_redis_sync
from app.config import settings
from app.models.enums import NotificationType
from app.models.notification import Notification


CHANNEL = "primex_notifications"


def add_notification(
    *,
    db,
    user_id: uuid.UUID,
    type: NotificationType,
    title: str,
    body: str | None = None,
    data: dict | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        data=data,
        created_at=datetime.now(timezone.utc),
    )
    db.add(notification)
    return notification


def notification_to_payload(notification: Notification) -> dict:
    return {
        "id": str(notification.id),
        "user_id": str(notification.user_id),
        "type": notification.type.value,
        "title": notification.title,
        "body": notification.body,
        "data": notification.data,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
        "read_at": notification.read_at.isoformat() if notification.read_at else None,
    }


async def publish_notification(*, user_id: uuid.UUID, notification: Notification) -> None:
    if not settings.REDIS_ENABLED:
        return
    client = get_redis_sync()
    payload = json.dumps({"user_id": str(user_id), "notification": {"type": "notification", **notification_to_payload(notification)}})
    await asyncio.to_thread(client.publish, CHANNEL, payload)

