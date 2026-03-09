from __future__ import annotations

import asyncio
import logging
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import settings
from app.db import SessionLocal
from app.services.system_task_instances import generate_system_task_instances


logger = logging.getLogger(__name__)


def scheduler_timezone() -> ZoneInfo:
    try:
        return ZoneInfo(settings.APP_TIMEZONE)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def scheduler_run_time() -> time:
    return time(
        hour=max(0, min(int(settings.SYSTEM_TASK_SCHEDULER_HOUR), 23)),
        minute=max(0, min(int(settings.SYSTEM_TASK_SCHEDULER_MINUTE), 59)),
    )


def next_scheduler_run_after(now_utc: datetime) -> datetime:
    tz = scheduler_timezone()
    local_now = now_utc.astimezone(tz)
    scheduled_today = datetime.combine(local_now.date(), scheduler_run_time(), tzinfo=tz)
    if local_now < scheduled_today:
        return scheduled_today.astimezone(timezone.utc)
    return (scheduled_today + timedelta(days=1)).astimezone(timezone.utc)


async def run_system_task_scheduler_once(now_utc: datetime | None = None) -> int:
    now_utc = now_utc or datetime.now(timezone.utc)
    async with SessionLocal() as db:
        created = await generate_system_task_instances(db=db, now_utc=now_utc)
        await db.commit()
    logger.info("System task scheduler created %s task(s)", created)
    return created


async def run_system_task_scheduler_forever() -> None:
    if not settings.SYSTEM_TASK_SCHEDULER_ENABLED:
        logger.info("System task scheduler is disabled")
        return

    tz = scheduler_timezone()
    now_utc = datetime.now(timezone.utc)
    if now_utc.astimezone(tz).time() >= scheduler_run_time():
        await run_system_task_scheduler_once(now_utc=now_utc)

    while True:
        now_utc = datetime.now(timezone.utc)
        next_run_utc = next_scheduler_run_after(now_utc)
        sleep_seconds = max((next_run_utc - now_utc).total_seconds(), 1)
        await asyncio.sleep(sleep_seconds)
        await run_system_task_scheduler_once()
