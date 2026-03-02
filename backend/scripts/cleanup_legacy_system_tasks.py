import argparse
import asyncio
from datetime import datetime, timezone

from sqlalchemy import delete, func, select, update

from app.db import SessionLocal
from app.models.system_task_occurrence import SystemTaskOccurrence
from app.models.system_task_occurrence_override import SystemTaskOccurrenceOverride
from app.models.task import Task


async def _count_legacy_tasks(db) -> tuple[int, int]:
    total = (
        await db.execute(
            select(func.count()).where(
                Task.system_template_origin_id.is_not(None),
                Task.origin_run_at.is_(None),
            )
        )
    ).scalar_one()
    active = (
        await db.execute(
            select(func.count()).where(
                Task.system_template_origin_id.is_not(None),
                Task.origin_run_at.is_(None),
                Task.is_active.is_(True),
            )
        )
    ).scalar_one()
    return int(total or 0), int(active or 0)


async def _count_occurrences(db) -> tuple[int, int]:
    occ_count = (await db.execute(select(func.count()).select_from(SystemTaskOccurrence))).scalar_one()
    override_count = (
        await db.execute(select(func.count()).select_from(SystemTaskOccurrenceOverride))
    ).scalar_one()
    return int(occ_count or 0), int(override_count or 0)


async def run(apply_changes: bool) -> None:
    async with SessionLocal() as db:
        legacy_total, legacy_active = await _count_legacy_tasks(db)
        occ_count, override_count = await _count_occurrences(db)

        print("Legacy system task cleanup")
        print(f"- Legacy tasks (system_template_origin_id and origin_run_at IS NULL): {legacy_total}")
        print(f"- Active legacy tasks: {legacy_active}")
        print(f"- system_task_occurrences rows: {occ_count}")
        print(f"- system_task_occurrence_overrides rows: {override_count}")

        if not apply_changes:
            print("Dry-run mode: no changes applied.")
            return

        now = datetime.now(timezone.utc)
        await db.execute(
            update(Task)
            .where(
                Task.system_template_origin_id.is_not(None),
                Task.origin_run_at.is_(None),
                Task.is_active.is_(True),
            )
            .values(is_active=False, updated_at=now)
        )

        await db.execute(delete(SystemTaskOccurrence))
        await db.execute(delete(SystemTaskOccurrenceOverride))
        await db.commit()

        legacy_total_after, legacy_active_after = await _count_legacy_tasks(db)
        occ_after, override_after = await _count_occurrences(db)
        print("After cleanup:")
        print(f"- Legacy tasks: {legacy_total_after}")
        print(f"- Active legacy tasks: {legacy_active_after}")
        print(f"- system_task_occurrences rows: {occ_after}")
        print(f"- system_task_occurrence_overrides rows: {override_after}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Cleanup legacy system tasks and occurrences.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply changes (default is dry-run).",
    )
    args = parser.parse_args()
    asyncio.run(run(args.apply))


if __name__ == "__main__":
    main()
