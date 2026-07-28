from __future__ import annotations

import asyncio

from sqlalchemy import text

from app.db import SessionLocal
from app.services.primeflow_report_delivery import validate_report_config


async def main() -> None:
    validate_report_config()
    async with SessionLocal() as db:
        await db.execute(text("SELECT 1"))
        default_active_jobs = (
            await db.execute(
                text(
                    """
                    SELECT COUNT(*)
                    FROM primeflow_report_schedules
                    WHERE is_active IS TRUE
                      AND is_default IS TRUE
                    """
                )
            )
        ).scalar_one()
    if default_active_jobs != 5:
        raise RuntimeError(
            "PrimeFlow report scheduler requires five active default schedules; "
            f"found {default_active_jobs}."
        )
    print(
        "report scheduler dry-run health OK: configuration, database connectivity, "
        f"and default schedules={default_active_jobs}"
    )


if __name__ == "__main__":
    asyncio.run(main())
