"""Repair completed task dates only, preserving before/after audit evidence."""
import asyncio
from datetime import timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select, or_

from app.config import settings
from app.db import SessionLocal
from app.models.task import Task, normalize_completed_task_dates
from app.services.audit import add_audit_log


def snapshot(task):
    return {key: getattr(task, key).isoformat() if getattr(task, key) else None
            for key in ("start_date", "due_date", "original_due_date", "completed_at")}


async def main():
    tz = ZoneInfo(settings.APP_TIMEZONE)

    def day(value):
        if value is None:
            return None
        return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).astimezone(tz).date()

    async with SessionLocal() as db:
        tasks = (await db.execute(select(Task).where(
            Task.is_active.is_(True), Task.status == "DONE", Task.completed_at.is_not(None)
            , Task.system_template_origin_id.is_(None), Task.system_task_slot_id.is_(None),
            or_(Task.is_personal.is_(True), Task.is_1h_report.is_(True),
                Task.is_r1.is_(True), Task.is_bllok.is_(True))
        ).with_for_update())).scalars().all()
        count = 0
        future_starts = 0
        for task in tasks:
            before = snapshot(task)
            bad_start = task.start_date is not None and day(task.start_date) > day(task.completed_at)
            normalize_completed_task_dates(None, None, task)
            after = snapshot(task)
            if before == after:
                continue
            count += 1
            future_starts += int(bad_start)
            add_audit_log(db=db, actor_user_id=None, entity_type="task", entity_id=task.id,
                          action="completed_task_dates_repair", before=before, after=after)
        await db.flush()
        for task in tasks:
            if day(task.due_date) != day(task.completed_at):
                raise RuntimeError("Completion/due date invariant failed")
            if task.start_date is not None and day(task.start_date) > day(task.completed_at):
                raise RuntimeError("Start date invariant failed")
        await db.commit()
        print(f"COMMITTED: repaired={count}, future_starts={future_starts}, checked={len(tasks)}")


if __name__ == "__main__":
    asyncio.run(main())
