"""Repair explicitly diagnosed completed tasks, keeping an audit snapshot."""
import asyncio
import uuid

from sqlalchemy import select, text

from app.db import SessionLocal
from app.models.task import Task, normalize_completed_task_dates
from app.services.audit import add_audit_log


TASK_IDS = [uuid.UUID(value) for value in (
    "eb8f28b6-fc9d-45d1-8b33-2a36859d4934",
    "e351f3a1-ccba-47e5-9b7a-b5bc510aaabc",
    "cc8dbf33-1033-446d-a912-fab894d9ba02",
    "b30a9fd6-870d-466f-aee4-c19ac159ce92",
    "fe7ea66e-e99e-44a2-9d91-0fb6ba7da01e",
    "a7d63434-fdc0-402d-adbb-13a891067a67",
    "0e14952d-43d7-42a6-b3ab-3740662f1872",
    "d6fb252c-fc61-4988-a8db-795b86b998a5",
    "e9da735c-1850-4fd6-95f4-a209062aa28e",
)]


def snapshot(task):
    return {key: getattr(task, key).isoformat() if getattr(task, key) else None
            for key in ("start_date", "due_date", "original_due_date", "completed_at")}


async def main():
    async with SessionLocal() as db:
        tasks = (await db.execute(select(Task).where(Task.id.in_(TASK_IDS)).with_for_update())).scalars().all()
        if len(tasks) != len(TASK_IDS) or any(task.status != "DONE" or not task.completed_at for task in tasks):
            raise RuntimeError("Targets changed; refusing repair")
        for task in tasks:
            before = snapshot(task)
            normalize_completed_task_dates(None, None, task)
            after = snapshot(task)
            if before != after:
                add_audit_log(db=db, actor_user_id=None, entity_type="task", entity_id=task.id,
                              action="completed_task_dates_repair", before=before, after=after)
            print(task.id, "BEFORE", before, "AFTER", after)
        await db.flush()
        remaining = (await db.execute(text("""
            SELECT id FROM tasks WHERE id = ANY(:ids)
            AND LEAST(start_date::date, due_date::date) <= DATE '2026-09-27'
            AND GREATEST(start_date::date, due_date::date) >= DATE '2026-09-21'
        """), {"ids": TASK_IDS})).all()
        if remaining:
            raise RuntimeError("Repair still overlaps Next Week; rolling back")
        await db.commit()
        print(f"COMMITTED: all {len(tasks)} tasks excluded from Next Week; audit snapshots saved")


if __name__ == "__main__":
    asyncio.run(main())
