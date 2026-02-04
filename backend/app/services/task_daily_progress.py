from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TaskStatus
from app.models.task_daily_progress import TaskDailyProgress


def _derive_daily_status(
    *,
    old_completed: int,
    new_completed: int,
    total: int,
) -> TaskStatus:
    if total <= 0:
        return TaskStatus.TODO
    if new_completed <= 0:
        return TaskStatus.TODO
    if new_completed >= total:
        return TaskStatus.DONE
    return TaskStatus.IN_PROGRESS


async def upsert_task_daily_progress(
    db: AsyncSession,
    *,
    task_id: uuid.UUID,
    day_date: date,
    old_completed: int,
    new_completed: int,
    total: int,
) -> None:
    status = _derive_daily_status(old_completed=old_completed, new_completed=new_completed, total=total)
    delta = new_completed - old_completed
    delta_positive = delta if delta > 0 else 0

    existing = (
        await db.execute(
            select(TaskDailyProgress).where(
                TaskDailyProgress.task_id == task_id,
                TaskDailyProgress.day_date == day_date,
            )
        )
    ).scalar_one_or_none()

    if existing is None:
        db.add(
            TaskDailyProgress(
                task_id=task_id,
                day_date=day_date,
                completed_value=max(0, new_completed),
                total_value=max(0, total),
                completed_delta=max(0, delta_positive),
                daily_status=status.value,
            )
        )
        return

    existing.completed_value = max(0, new_completed)
    existing.total_value = max(0, total)
    if delta_positive:
        existing.completed_delta = max(0, (existing.completed_delta or 0) + delta_positive)
    existing.daily_status = status.value
