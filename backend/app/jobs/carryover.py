from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.models.task import Task
from app.services.audit import add_audit_log


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _month_start(d: date) -> date:
    return d.replace(day=1)


async def carry_over_to_date(target_date: date, reason: str) -> int:
    moved = 0
    async with SessionLocal() as db:
        tasks = (
            await db.execute(
                select(Task).where(Task.completed_at.is_(None), Task.planned_for.is_not(None), Task.planned_for < target_date)
            )
        ).scalars().all()

        for task in tasks:
            before_planned = task.planned_for.isoformat() if task.planned_for else None
            if not task.is_carried_over and task.planned_for is not None:
                task.is_carried_over = True
                task.carried_over_from = task.planned_for
            task.planned_for = target_date
            add_audit_log(
                db=db,
                actor_user_id=None,
                entity_type="task",
                entity_id=task.id,
                action="carried_over",
                before={"planned_for": before_planned},
                after={"planned_for": target_date.isoformat(), "reason": reason},
            )
            moved += 1

        await db.commit()
    return moved


async def run_carryover() -> dict:
    today = datetime.now(timezone.utc).date()
    results: dict[str, int] = {}

    if today.weekday() == 0:  # Monday
        results["weekly"] = await carry_over_to_date(_week_start(today), "weekly")

    if today.day == 1:
        results["monthly"] = await carry_over_to_date(_month_start(today), "monthly")

    return results

