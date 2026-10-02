"""Capture staff Realization at 16:15. This loop never sends email."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, time

from app.db import SessionLocal
from app.services.m3_reporting_points import build_realization_capture, locked_report, refresh_report
from app.services.primeflow_report import report_timezone

logger = logging.getLogger(__name__)
CAPTURE_TIME = time(16, 15)


def is_capture_minute(now: datetime) -> bool:
    local = now.astimezone(report_timezone())
    return local.weekday() < 5 and local.time().replace(second=0, microsecond=0, tzinfo=None) == CAPTURE_TIME


async def run_m3_reporting_points_scheduler_once(now: datetime | None = None) -> bool:
    now = now or datetime.now(report_timezone())
    if not is_capture_minute(now):
        return False
    day = now.astimezone(report_timezone()).date()
    async with SessionLocal() as db:
        row = await locked_report(db, day, wait=False)
        if row is None or row.realization_captured_at is not None or row.status == "SENT":
            return False
        row.realization = await build_realization_capture(db, day)
        row.realization_captured_at = now
        # Manual answers survive capture; the realization is never overwritten.
        if not row.generated_at:
            await refresh_report(db, row)
        await db.commit()
        logger.info("m3_reporting_points_realization_captured day=%s at=%s", day, now.isoformat())
        return True


async def run_m3_reporting_points_scheduler_forever() -> None:
    while True:
        try:
            await run_m3_reporting_points_scheduler_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("m3_reporting_points_capture_failed")
        await asyncio.sleep(15)
