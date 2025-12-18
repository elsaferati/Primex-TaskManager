from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.models.enums import NotificationType
from app.models.notification import Notification
from app.models.task import Task
from app.services.notifications import add_notification, publish_notification


async def process_overdue() -> int:
    now = datetime.now(timezone.utc)
    today = now.date()
    sent = 0
    async with SessionLocal() as db:
        tasks = (
            await db.execute(
                select(Task).where(
                    Task.completed_at.is_(None),
                    Task.planned_for.is_not(None),
                    Task.planned_for < today,
                    Task.overdue_notified_at.is_(None),
                    Task.assigned_to_user_id.is_not(None),
                )
            )
        ).scalars().all()

        created_notifications: list[Notification] = []
        for task in tasks:
            created_notifications.append(
                add_notification(
                    db=db,
                    user_id=task.assigned_to_user_id,
                    type=NotificationType.overdue,
                    title="Task overdue",
                    body=task.title,
                    data={"task_id": str(task.id)},
                )
            )
            task.overdue_notified_at = now
            sent += 1

        await db.commit()

        for n in created_notifications:
            try:
                await publish_notification(user_id=n.user_id, notification=n)
            except Exception:
                pass

    return sent

