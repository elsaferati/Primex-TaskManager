"""Backfill `daily_status` for all TaskDailyProgress rows.

Recalculates `daily_status` from `completed_value` and `total_value` using the same
rules as `app.services.task_daily_progress._derive_daily_status`:

- 0/total -> TODO
- 1..(total-1)/total -> IN_PROGRESS
- total/total (or above) -> DONE
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.db import SessionLocal
from app.models.enums import TaskStatus
from app.models.task_daily_progress import TaskDailyProgress


def derive_daily_status(*, completed_value: int, total_value: int) -> TaskStatus:
    if total_value <= 0:
        return TaskStatus.TODO
    if completed_value <= 0:
        return TaskStatus.TODO
    if completed_value >= total_value:
        return TaskStatus.DONE
    return TaskStatus.IN_PROGRESS


async def fix_task_daily_progress_status() -> None:
    async with SessionLocal() as db:
        result = await db.execute(select(TaskDailyProgress))
        records = result.scalars().all()

        if not records:
            print("No TaskDailyProgress records found.")
            return

        print(f"Found {len(records)} TaskDailyProgress record(s) to check...")

        updated_count = 0
        for record in records:
            correct_status = derive_daily_status(
                completed_value=record.completed_value,
                total_value=record.total_value,
            )

            current_raw = (record.daily_status or "").strip()
            try:
                current_status = TaskStatus(current_raw)
            except ValueError:
                current_status = None

            if current_status != correct_status:
                record.daily_status = correct_status.value
                updated_count += 1
                print(
                    "  Updated record "
                    f"(task_id: {record.task_id}, day: {record.day_date}): "
                    f"{current_raw or 'UNKNOWN'} -> {correct_status.value} "
                    f"({record.completed_value}/{record.total_value})"
                )

        if updated_count:
            await db.commit()
            print(f"\nSuccessfully updated {updated_count} record(s).")
        else:
            print("\nAll records already have correct status. No updates needed.")


if __name__ == "__main__":
    asyncio.run(fix_task_daily_progress_status())

