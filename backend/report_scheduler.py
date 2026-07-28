from __future__ import annotations

import asyncio
import logging
import signal
import uuid
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.db import SessionLocal
from app.models.primeflow_report_schedule import PrimeFlowReportSchedule
from app.services.primeflow_report import previous_working_day, report_timezone
from app.services.primeflow_report_delivery import deliver_report, execute_chain, validate_report_config

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("primeflow-report-scheduler")


async def scheduled_job(schedule_id: str, slot: str, version: int, timezone_name: str) -> None:
    now = datetime.now(__import__("zoneinfo").ZoneInfo(timezone_name))
    async with SessionLocal() as db:
        schedule = await db.get(PrimeFlowReportSchedule, uuid.UUID(schedule_id))
        predecessor_schedule = (
            await db.get(PrimeFlowReportSchedule, schedule.predecessor_schedule_id)
            if schedule and schedule.backfill_enabled and schedule.predecessor_schedule_id else None
        )
    if predecessor_schedule:
        predecessor_day = now.date()
        if predecessor_schedule.report_slot >= slot:
            predecessor_day = previous_working_day(predecessor_day)
        await deliver_report(predecessor_day, predecessor_schedule.report_slot, trigger_type="BACKFILL")
        await deliver_report(
            now.date(), slot, schedule_id=schedule_id, schedule_version=version,
            scheduled_for=now, trigger_type="SCHEDULED",
        )
    else:
        await execute_chain(now.date(), slot, schedule_id=schedule_id, schedule_version=version, scheduled_for=now)


async def sync_jobs(scheduler: AsyncIOScheduler) -> int:
    async with SessionLocal() as db:
        rows = (await db.execute(
            select(PrimeFlowReportSchedule)
            .where(PrimeFlowReportSchedule.is_active.is_(True))
            .order_by(PrimeFlowReportSchedule.sort_order)
        )).scalars().all()
    desired = set()
    for row in rows:
        job_id = f"primeflow-1h-schedule-{row.id}"
        desired.add(job_id)
        weekdays = ",".join(str(day) for day in row.weekdays)
        scheduler.add_job(
            scheduled_job,
            CronTrigger(
                day_of_week=weekdays, hour=row.execution_time.hour, minute=row.execution_time.minute,
                timezone=row.timezone,
            ),
            args=[str(row.id), row.report_slot, row.version, row.timezone],
            id=job_id, max_instances=1, coalesce=True,
            misfire_grace_time=row.grace_period_minutes * 60, replace_existing=True,
        )
    for job in scheduler.get_jobs():
        if job.id.startswith("primeflow-1h-schedule-") and job.id not in desired:
            scheduler.remove_job(job.id)
    return len(desired)


async def main() -> None:
    validate_report_config()
    timezone = report_timezone()
    scheduler = AsyncIOScheduler(timezone=timezone)
    count = await sync_jobs(scheduler)
    scheduler.add_job(
        sync_jobs, "interval", seconds=45, args=[scheduler], id="primeflow-1h-config-refresh",
        max_instances=1, coalesce=True, replace_existing=True,
    )
    scheduler.start()
    logger.info("scheduler_ready jobs=%s timezone=%s refresh_seconds=45", count, timezone)
    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stopped.set)
        except NotImplementedError:
            pass
    await stopped.wait()
    scheduler.shutdown(wait=True)


if __name__ == "__main__":
    asyncio.run(main())
