from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import settings
from app.db import SessionLocal
from app.services.system_task_instances import (
    ensure_slots_initialized,
    ensure_task_instances_in_range,
    generate_system_task_instances,
    reconcile_system_task_slots,
)


async def generate_system_tasks() -> int:
    async with SessionLocal() as db:
        await ensure_slots_initialized(db)
        created = await generate_system_task_instances(db=db, now_utc=datetime.now(timezone.utc))
        await db.commit()
    return created


def _app_tz() -> ZoneInfo:
    try:
        return ZoneInfo(settings.APP_TIMEZONE)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


async def pregenerate_system_tasks_today() -> int:
    async with SessionLocal() as db:
        await ensure_slots_initialized(db)
        today_local = datetime.now(timezone.utc).astimezone(_app_tz()).date()
        created = await ensure_task_instances_in_range(db=db, start=today_local, end=today_local)
        await db.commit()
    return created


async def reconcile_system_task_slots_daily() -> dict[str, int]:
    async with SessionLocal() as db:
        await ensure_slots_initialized(db)
        result = await reconcile_system_task_slots(db=db, lookback_days=7)
        await db.commit()
    return result
