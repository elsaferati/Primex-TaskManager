from __future__ import annotations

import asyncio

from sqlalchemy import text

from app.db import SessionLocal
from app.services.primeflow_report import SCHEDULES
from app.services.primeflow_report_delivery import validate_report_config


async def main() -> None:
    validate_report_config()
    if len(SCHEDULES) != 5:
        raise RuntimeError(f"Expected 5 schedules, found {len(SCHEDULES)}")
    async with SessionLocal() as db:
        await db.execute(text("SELECT 1"))
    print("report scheduler dry-run health OK: configuration, five jobs, database connectivity")


if __name__ == "__main__":
    asyncio.run(main())
