"""Weekday delivery of the separate reporting-points M2 and M3 reports."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, time

from app.db import SessionLocal
from app.services import m2_reporting_points as m2, m3_reporting_points as m3
from app.services.primeflow_report import report_timezone

logger = logging.getLogger(__name__)
AUTO_RECIPIENTS = ("ga@primexeu.com", "info@primexeu.com")
AUTO_SEND_TIMES = (("M2", time(12, 15), m2), ("M3", time(16, 20), m3))


async def run_reporting_points_auto_scheduler_once(now: datetime | None = None) -> bool:
    local = (now or datetime.now(report_timezone())).astimezone(report_timezone())
    if local.weekday() >= 5:
        return False
    sent = False
    for name, scheduled_time, service in AUTO_SEND_TIMES:
        if local.time().replace(tzinfo=None) < scheduled_time:
            continue
        try:
            async with SessionLocal() as db:
                # Use the same daily lock as manual saves, capture and sends.
                # Keep it through refresh, SMTP delivery and the marker commit.
                row = await service.locked_report(db, local.date(), wait=False)
                if row is None or row.auto_sent_at is not None:
                    continue
                try:
                    # Generate even if nobody opened the page; retain answers.
                    # M3 also takes the latest post-16:15 realization capture.
                    await service.refresh_report(db, row, local)
                except Exception as exc:
                    row.status, row.last_error = "FAILED", str(exc)[:2000]
                    await db.commit()
                    raise
                await service.send_report(db, row, {"to": list(AUTO_RECIPIENTS), "cc": [], "bcc": []}, automatic=True)
                sent = True
                logger.info("reporting_points_auto_sent report=%s day=%s slot=%s", name, local.date(), scheduled_time)
        except asyncio.CancelledError:
            raise
        except Exception:
            # A failed send stays due, and one report cannot block the other.
            logger.exception("reporting_points_auto_send_failed report=%s day=%s", name, local.date())
    return sent


async def run_reporting_points_auto_scheduler_forever() -> None:
    while True:
        try:
            await run_reporting_points_auto_scheduler_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("reporting_points_auto_scheduler_failed")
        # Includes same-day catch-up after downtime, never historical backfill.
        await asyncio.sleep(30)
