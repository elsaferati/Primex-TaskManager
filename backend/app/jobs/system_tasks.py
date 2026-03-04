from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.config import settings
from app.db import SessionLocal
from app.services.system_task_instances import (
    ensure_slots_initialized,
    ensure_task_instances_in_range,
    generate_system_task_instances,
    reconcile_system_task_slots as reconcile_system_task_slots_service,
)


async def generate_system_tasks() -> int:
    async with SessionLocal() as db:
        await ensure_slots_initialized(db)
        created = await generate_system_task_instances(db=db, now_utc=datetime.now(timezone.utc))
        await db.commit()
    return created


async def pregenerate_system_tasks_by_7am() -> int:
    now_utc = datetime.now(timezone.utc)
    try:
        app_tz = ZoneInfo(settings.APP_TIMEZONE)
    except Exception:
        app_tz = timezone.utc
    today_local = now_utc.astimezone(app_tz).date()
    async with SessionLocal() as db:
        await ensure_slots_initialized(db)
        created = await ensure_task_instances_in_range(db=db, start=today_local, end=today_local)
        await db.commit()
    return created


async def reconcile_system_task_slots() -> dict:
    now_utc = datetime.now(timezone.utc)
    async with SessionLocal() as db:
        await ensure_slots_initialized(db)
        result = await reconcile_system_task_slots_service(db=db, now_utc=now_utc, lookback_days=30)
        await db.commit()
    return result
