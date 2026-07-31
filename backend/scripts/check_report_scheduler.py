from __future__ import annotations

import asyncio

from sqlalchemy import text

from app.db import SessionLocal
from app.services.primeflow_report_delivery import validate_report_config
from app.services.primeflow_report_schedule_config import default_schedule_validation_errors


async def main() -> None:
    validate_report_config()
    async with SessionLocal() as db:
        await db.execute(text("SELECT 1"))
        active_jobs = (
            await db.execute(
                text(
                    """
                    SELECT schedule.name, schedule.report_slot,
                           schedule.execution_time, schedule.timezone,
                           schedule.weekdays, schedule.is_default,
                           schedule.backfill_enabled,
                           predecessor.name AS predecessor_name
                    FROM primeflow_report_schedules AS schedule
                    LEFT JOIN primeflow_report_schedules AS predecessor
                      ON predecessor.id = schedule.predecessor_schedule_id
                    WHERE schedule.is_active IS TRUE
                      AND schedule.is_default IS TRUE
                    ORDER BY schedule.sort_order, schedule.name
                    """
                )
            )
        ).mappings().all()
    errors = default_schedule_validation_errors(active_jobs)
    if errors:
        raise RuntimeError(f"PrimeFlow 1H schedules are misconfigured: {'; '.join(errors)}")
    print(
        "report scheduler dry-run health OK: configuration, database connectivity, "
        "and weekday default schedules=5"
    )


if __name__ == "__main__":
    asyncio.run(main())
