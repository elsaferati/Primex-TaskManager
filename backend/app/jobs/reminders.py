from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.models.enums import NotificationType
from app.models.notification import Notification
from app.models.task import Task
from app.services.notifications import add_notification, publish_notification


async def process_reminders() -> int:
    now = datetime.now(timezone.utc)
    sent = 0
    async with SessionLocal() as db:
        tasks = (
            await db.execute(
                select(Task).where(
                    Task.reminder_enabled.is_(True),
                    Task.completed_at.is_(None),
                    Task.next_reminder_at.is_not(None),
                    Task.next_reminder_at <= now,
                )
            )
        ).scalars().all()

        created_notifications: list[Notification] = []
        for task in tasks:
            if task.assigned_to_user_id is None:
                task.next_reminder_at = now + timedelta(minutes=60)
                continue

            created_notifications.append(
                add_notification(
                    db=db,
                    user_id=task.assigned_to_user_id,
                    type=NotificationType.reminder,
                    title="1h Reminder",
                    body=task.title,
                    data={"task_id": str(task.id)},
                )
            )
            task.reminder_last_sent_at = now
            task.next_reminder_at = now + timedelta(minutes=60)
            sent += 1

        await db.commit()

        for n in created_notifications:
            try:
                await publish_notification(user_id=n.user_id, notification=n)
            except Exception:
                pass

    return sent

