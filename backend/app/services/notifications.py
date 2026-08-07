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
NOTIFICATION_TITLE_MAX_LEN = 300
NOTIFICATION_BODY_MAX_LEN = 4000


def fit_notification_text(value: str | None, max_len: int) -> str | None:
    """Keep notification fields within DB column limits without failing the write."""
    if value is None:
        return None
    text = value.strip() if isinstance(value, str) else str(value)
    if len(text) <= max_len:
        return text
    if max_len <= 1:
        return text[:max_len]
    return f"{text[: max_len - 1]}…"


def notification_task_preview(title: str | None, *, limit: int = 280) -> str | None:
    """Short readable preview for assignment notifications (not the full note body)."""
    cleaned = (title or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not cleaned:
        return None
    first_line = next((line.strip() for line in cleaned.splitlines() if line.strip()), cleaned)
    return fit_notification_text(first_line, limit)


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
        title=fit_notification_text(title, NOTIFICATION_TITLE_MAX_LEN) or "Notification",
        body=fit_notification_text(body, NOTIFICATION_BODY_MAX_LEN),
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
