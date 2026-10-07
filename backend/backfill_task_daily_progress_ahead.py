"""Backfill TaskDailyProgress for product work done before a task's due date.

Until the fix in `update_task`, product-count progress on a task whose due date
was still in the future was not logged per day. Daily Realization then credited
that work to the due/completion day instead of the day it happened.

This script rebuilds the missing rows from the task audit log ("updated" events
carry internal_notes before/after). It only inserts rows for days that have none
and that were before the task's due date at the time of the update; existing rows
are never changed.

Usage (from backend/):
    python backfill_task_daily_progress_ahead.py --since 2026-09-01          # dry run
    python backfill_task_daily_progress_ahead.py --since 2026-09-01 --apply
"""

from __future__ import annotations

import argparse
import asyncio
import re
import uuid
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models.audit_log import AuditLog
from app.models.enums import ProjectPhaseStatus, TaskStatus
from app.models.task import Task
from app.models.task_daily_progress import TaskDailyProgress

COMPLETED_PRODUCTS_RE = re.compile(r"completed_products[:=]\s*(\d+)", re.IGNORECASE)


def _completed(notes: str | None) -> int:
    match = COMPLETED_PRODUCTS_RE.search(notes or "")
    return max(0, int(match.group(1))) if match else 0


def _utc_day(raw: str | None) -> date | None:
    if not raw:
        return None
    parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    return parsed.astimezone(timezone.utc).date() if parsed.tzinfo else parsed.date()


def _status(completed: int, total: int) -> TaskStatus:
    if total <= 0 or completed <= 0:
        return TaskStatus.TODO
    return TaskStatus.DONE if completed >= total else TaskStatus.IN_PROGRESS


async def backfill(*, since: date, apply: bool) -> None:
    tz = ZoneInfo(settings.REALIZATION_TIMEZONE)
    today = datetime.now(tz).date()
    async with SessionLocal() as db:
        tasks = {
            task.id: task
            for task in (await db.execute(select(Task).where(
                Task.project_id.is_not(None),
                Task.daily_products > 0,
                Task.phase.in_([ProjectPhaseStatus.PRODUCT.value, ProjectPhaseStatus.CONTROL.value]),
            ))).scalars().all()
        }
        if not tasks:
            print("No product tasks found.")
            return
        events = (await db.execute(select(AuditLog).where(
            AuditLog.entity_type == "task",
            AuditLog.action == "updated",
            AuditLog.entity_id.in_(list(tasks)),
            AuditLog.created_at >= datetime.combine(since, datetime.min.time(), tz),
        ).order_by(AuditLog.entity_id, AuditLog.created_at))).scalars().all()
        existing = {
            (row.task_id, row.day_date)
            for row in (await db.execute(select(TaskDailyProgress.task_id, TaskDailyProgress.day_date).where(
                TaskDailyProgress.task_id.in_(list(tasks)),
                TaskDailyProgress.day_date >= since,
            ))).all()
        }

        # (task_id, day) -> [end completed value, positive delta]
        days: dict[tuple[uuid.UUID, date], list[int]] = {}
        for event in events:
            before, after = event.before or {}, event.after or {}
            if "internal_notes" not in after:
                continue
            old, new = _completed(before.get("internal_notes")), _completed(after.get("internal_notes"))
            if old == new:
                continue
            day = event.created_at.astimezone(tz).date()
            due_day = _utc_day(after.get("due_date"))
            if day >= today or due_day is None or due_day <= day:
                continue  # Logged normally by update_task (due today/past) or still open.
            if (event.entity_id, day) in existing:
                continue
            entry = days.setdefault((event.entity_id, day), [new, 0])
            entry[0] = new
            entry[1] += max(0, new - old)

        for (task_id, day), (completed, delta) in sorted(days.items(), key=lambda item: (item[0][1], str(item[0][0]))):
            task = tasks[task_id]
            total = int(task.daily_products or 0)
            status = _status(completed, total)
            print(f"  {day} {task.title[:60]!r}: completed={completed}/{total} delta=+{delta} status={status.value}")
            if apply:
                db.add(TaskDailyProgress(
                    task_id=task_id,
                    day_date=day,
                    completed_value=completed,
                    total_value=total,
                    completed_delta=delta,
                    daily_status=status.value,
                    finish_period="ALL",
                ))

        if apply:
            await db.commit()
            print(f"Inserted {len(days)} row(s).")
        else:
            print(f"Dry run: {len(days)} row(s) would be inserted. Re-run with --apply to write them.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--since", type=date.fromisoformat, required=True, help="First day to rebuild (YYYY-MM-DD).")
    parser.add_argument("--apply", action="store_true", help="Write rows; without it only prints them.")
    args = parser.parse_args()
    asyncio.run(backfill(since=args.since, apply=args.apply))
