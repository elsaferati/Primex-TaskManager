from __future__ import annotations

import asyncio
from datetime import time

from sqlalchemy import text

from app.db import SessionLocal
from app.services.primeflow_report_delivery import validate_report_config


async def main() -> None:
    validate_report_config()
    async with SessionLocal() as db:
        await db.execute(text("SELECT 1"))
        active_jobs = (
            await db.execute(
                text(
                    """
                    SELECT name, report_slot, execution_time, timezone, weekdays,
                           is_default, backfill_enabled
                    FROM primeflow_report_schedules
                    WHERE is_active IS TRUE
                    """
                )
            )
        ).mappings().all()
    if len(active_jobs) != 1:
        raise RuntimeError(
            "PrimeFlow report scheduler requires exactly one active schedule; "
            f"found {len(active_jobs)}."
        )
    job = active_jobs[0]
    expected = {
        "report_slot": "10:00",
        "execution_time": time(9, 0),
        "timezone": "Europe/Tirane",
        "weekdays": [4],
        "is_default": True,
        "backfill_enabled": False,
    }
    mismatches = {
        key: {"expected": value, "actual": job[key]}
        for key, value in expected.items() if job[key] != value
    }
    if mismatches:
        raise RuntimeError(f"PrimeFlow Friday 09:00 schedule is misconfigured: {mismatches}")
    print(
        "report scheduler dry-run health OK: configuration, database connectivity, "
        "and weekly Friday 09:00 schedule=1"
    )


if __name__ == "__main__":
    asyncio.run(main())
