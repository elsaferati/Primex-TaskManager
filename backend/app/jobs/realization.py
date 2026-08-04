from __future__ import annotations

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models.department import Department
from app.models.enums import UserRole
from app.models.user import User
from app.services.realization_calculator import calculate_weekly_period
from app.services.realization_daily import calculate_daily_period
from app.services.realization_periods import ensure_daily_period, ensure_weekly_period
from app.services.system_task_schedule import _is_working_day


logger = logging.getLogger(__name__)


async def generate_daily_realization_snapshots() -> dict[str, int]:
    """Create the stored end-of-day realization snapshot for every department."""
    day = datetime.now(ZoneInfo(settings.REALIZATION_TIMEZONE)).date()
    if not settings.REALIZATION_DAILY_ENABLED or not _is_working_day(day):
        return {"calculated": 0, "skipped": 0, "failed": 0}

    calculated = skipped = failed = 0
    async with SessionLocal() as db:
        department_ids = (await db.execute(select(Department.id))).scalars().all()
        admins = (
            await db.execute(
                select(User).where(User.role == UserRole.ADMIN, User.is_active.is_(True)).limit(1)
            )
        ).scalars().all()
        admin_id = admins[0].id if admins else None
        for department_id in department_ids:
            manager = (
                await db.execute(
                    select(User)
                    .where(
                        User.department_id == department_id,
                        User.role == UserRole.MANAGER,
                        User.is_active.is_(True),
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
            actor_id = manager.id if manager else admin_id
            if actor_id is None:
                skipped += 1
                continue
            try:
                period, planned = await ensure_daily_period(
                    db,
                    department_id=department_id,
                    day=day,
                    created_by=actor_id,
                )
                if planned is None:
                    skipped += 1
                    await db.rollback()
                    continue
                await calculate_daily_period(
                    db,
                    period=period,
                    planned_snapshot=planned,
                    actor_id=actor_id,
                )
                await db.commit()
                calculated += 1
            except Exception:
                await db.rollback()
                failed += 1
                logger.exception(
                    "Daily realization snapshot failed for department %s", department_id
                )
    return {"calculated": calculated, "skipped": skipped, "failed": failed}


async def generate_weekly_realization_results() -> dict[str, int]:
    """Finalize every calculable department after the Friday FINAL snapshot exists."""
    day = datetime.now(ZoneInfo(settings.REALIZATION_TIMEZONE)).date()
    calculated = skipped = failed = 0
    async with SessionLocal() as db:
        department_ids = (await db.execute(select(Department.id))).scalars().all()
        admin = (
            await db.execute(
                select(User).where(User.role == UserRole.ADMIN, User.is_active.is_(True)).limit(1)
            )
        ).scalar_one_or_none()
        admin_id = admin.id if admin else None
        for department_id in department_ids:
            manager = (
                await db.execute(
                    select(User)
                    .where(
                        User.department_id == department_id,
                        User.role == UserRole.MANAGER,
                        User.is_active.is_(True),
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
            actor_id = manager.id if manager else admin_id
            if actor_id is None:
                skipped += 1
                continue
            try:
                period, planned, final = await ensure_weekly_period(
                    db,
                    department_id=department_id,
                    week_start=day,
                    created_by=actor_id,
                )
                if planned is None or final is None or period.status not in {"OPEN", "CALCULATED"}:
                    skipped += 1
                    await db.rollback()
                    continue
                await calculate_weekly_period(
                    db,
                    period=period,
                    planned_snapshot=planned,
                    final_snapshot=final,
                    actor_id=actor_id,
                )
                await db.commit()
                calculated += 1
            except Exception:
                await db.rollback()
                failed += 1
                logger.exception(
                    "Weekly realization calculation failed for department %s", department_id
                )
    return {"calculated": calculated, "skipped": skipped, "failed": failed}
