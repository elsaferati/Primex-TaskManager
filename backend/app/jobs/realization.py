from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import SessionLocal
from app.models.department import Department
from app.models.enums import UserRole
from app.models.user import User
from app.models.weekly_planner_snapshot import WeeklyPlannerSnapshot
from app.schemas.weekly_planner_snapshot import WeeklySnapshotType
from app.services.realization_calculator import calculate_weekly_period
from app.services.daily_realization_baseline import ensure_daily_baseline
from app.services.realization_daily import calculate_daily_period
from app.services.realization_periods import (
    ensure_daily_period,
    ensure_weekly_period,
    normalize_week_start,
    select_weekly_snapshots,
)
from app.services.system_task_schedule import _is_working_day


logger = logging.getLogger(__name__)


async def capture_daily_realization_baselines() -> dict[str, int]:
    """Idempotently capture every department's planner plan at workday start."""
    day = datetime.now(ZoneInfo(settings.REALIZATION_TIMEZONE)).date()
    if not settings.REALIZATION_DAILY_ENABLED or not _is_working_day(day):
        return {"captured": 0, "skipped": 0, "failed": 0}
    captured = skipped = failed = 0
    async with SessionLocal() as db:
        department_ids = (await db.execute(select(Department.id))).scalars().all()
        admin = (await db.execute(select(User).where(
            User.role == UserRole.ADMIN, User.is_active.is_(True)
        ).limit(1))).scalar_one_or_none()
        for department_id in department_ids:
            actor = (await db.execute(select(User).where(
                User.department_id == department_id,
                User.role == UserRole.MANAGER,
                User.is_active.is_(True),
            ).limit(1))).scalar_one_or_none() or admin
            if actor is None:
                skipped += 1
                continue
            try:
                await ensure_daily_baseline(
                    db, department_id=department_id, day=day, actor=actor
                )
                await db.commit()
                captured += 1
            except Exception:
                await db.rollback()
                failed += 1
                logger.exception("Daily baseline capture failed for department %s", department_id)
    return {"captured": captured, "skipped": skipped, "failed": failed}


async def _capture_automatic_snapshot(
    *,
    db: AsyncSession,
    actor: User,
    department_id: uuid.UUID,
    day: date,
    snapshot_type: WeeklySnapshotType,
) -> WeeklyPlannerSnapshot:
    """Capture a missing official baseline/final snapshot from the live weekly planner."""
    # The manual and scheduled paths share one payload builder so their evidence
    # has the same structure and can be compared without special cases.
    from app.api.routers.planners import _create_and_store_weekly_snapshot

    response = await _create_and_store_weekly_snapshot(
        db=db,
        user=actor,
        department_id=department_id,
        week_start_date=normalize_week_start(day),
        snapshot_type=snapshot_type,
        is_this_week=True,
    )
    snapshot = (
        await db.execute(
            select(WeeklyPlannerSnapshot).where(
                WeeklyPlannerSnapshot.id == response.snapshot.id
            )
        )
    ).scalar_one()
    snapshot.payload = {
        **(snapshot.payload or {}),
        "automation": {
            "source": "realization_scheduler",
            "snapshot_type": snapshot_type.value,
            "captured_at": datetime.now(timezone.utc).isoformat(),
        },
    }
    await db.commit()
    return snapshot


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
            actor = manager or (admins[0] if admins else None)
            if actor is None:
                skipped += 1
                continue
            actor_id = actor.id
            try:
                planned, _ = await select_weekly_snapshots(
                    db,
                    department_id=department_id,
                    week_start=normalize_week_start(day),
                )
                if planned is None:
                    await _capture_automatic_snapshot(
                        db=db,
                        actor=actor,
                        department_id=department_id,
                        day=day,
                        snapshot_type=WeeklySnapshotType.PLANNED,
                    )
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
    """Capture Friday FINAL snapshots and calculate every eligible department."""
    day = datetime.now(ZoneInfo(settings.REALIZATION_TIMEZONE)).date()
    calculated = skipped = failed = 0
    async with SessionLocal() as db:
        department_ids = (await db.execute(select(Department.id))).scalars().all()
        admin = (
            await db.execute(
                select(User).where(User.role == UserRole.ADMIN, User.is_active.is_(True)).limit(1)
            )
        ).scalar_one_or_none()
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
            actor = manager or admin
            if actor is None:
                skipped += 1
                continue
            actor_id = actor.id
            try:
                planned, final = await select_weekly_snapshots(
                    db,
                    department_id=department_id,
                    week_start=normalize_week_start(day),
                )
                if planned is None:
                    planned = await _capture_automatic_snapshot(
                        db=db,
                        actor=actor,
                        department_id=department_id,
                        day=day,
                        snapshot_type=WeeklySnapshotType.PLANNED,
                    )
                if final is None:
                    final = await _capture_automatic_snapshot(
                        db=db,
                        actor=actor,
                        department_id=department_id,
                        day=day,
                        snapshot_type=WeeklySnapshotType.FINAL,
                    )
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
