from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import RealizationPeriodStatus
from app.models.realization import RealizationPeriod, RealizationPolicyVersion
from app.models.weekly_planner_snapshot import WeeklyPlannerSnapshot
from app.services.system_task_schedule import _is_working_day


class RealizationWorkflowError(ValueError):
    pass


def normalize_week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def weekly_end(value: date) -> date:
    current = normalize_week_start(value)
    working_days = 0
    while True:
        if _is_working_day(current):
            working_days += 1
            if working_days == 5:
                return current
        current += timedelta(days=1)


async def select_policy(db: AsyncSession, week_start: date) -> RealizationPolicyVersion:
    policy = (
        await db.execute(
            select(RealizationPolicyVersion)
            .where(
                RealizationPolicyVersion.effective_from <= week_start,
                (
                    RealizationPolicyVersion.effective_to.is_(None)
                    | (RealizationPolicyVersion.effective_to >= week_start)
                ),
                RealizationPolicyVersion.approved_at.is_not(None),
            )
            .order_by(
                RealizationPolicyVersion.version.desc(),
                RealizationPolicyVersion.effective_from.desc(),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if policy is None:
        raise RealizationWorkflowError("No applicable Realization policy exists for this week")
    return policy


async def select_weekly_snapshots(
    db: AsyncSession,
    *,
    department_id: uuid.UUID,
    week_start: date,
) -> tuple[WeeklyPlannerSnapshot | None, WeeklyPlannerSnapshot | None]:
    rows = (
        await db.execute(
            select(WeeklyPlannerSnapshot)
            .where(
                WeeklyPlannerSnapshot.department_id == department_id,
                WeeklyPlannerSnapshot.week_start_date == week_start,
                WeeklyPlannerSnapshot.snapshot_type.in_(("PLANNED", "FINAL")),
            )
            .order_by(WeeklyPlannerSnapshot.created_at.asc(), WeeklyPlannerSnapshot.id.asc())
        )
    ).scalars().all()
    planned = next((row for row in rows if row.snapshot_type == "PLANNED"), None)
    final_rows = [row for row in rows if row.snapshot_type == "FINAL"]
    return planned, final_rows[-1] if final_rows else None


async def ensure_weekly_period(
    db: AsyncSession,
    *,
    department_id: uuid.UUID,
    week_start: date,
    created_by: uuid.UUID | None,
) -> tuple[RealizationPeriod, WeeklyPlannerSnapshot | None, WeeklyPlannerSnapshot | None]:
    start = normalize_week_start(week_start)
    end = weekly_end(start)
    planned, final = await select_weekly_snapshots(
        db, department_id=department_id, week_start=start
    )
    period = (
        await db.execute(
            select(RealizationPeriod).where(
                RealizationPeriod.period_type == "WEEKLY",
                RealizationPeriod.slot == "ALL",
                RealizationPeriod.start_date == start,
                RealizationPeriod.end_date == end,
                RealizationPeriod.department_id == department_id,
            )
        )
    ).scalar_one_or_none()
    if period is None:
        policy = await select_policy(db, start)
        await db.execute(
            pg_insert(RealizationPeriod)
            .values(
                id=uuid.uuid4(),
                period_type="WEEKLY",
                slot="ALL",
                start_date=start,
                end_date=end,
                department_id=department_id,
                policy_version_id=policy.id,
                planned_snapshot_id=planned.id if planned else None,
                final_snapshot_id=final.id if final else None,
                status=RealizationPeriodStatus.OPEN.value,
                created_by=created_by,
            )
            .on_conflict_do_nothing(
                index_elements=[
                    RealizationPeriod.period_type,
                    RealizationPeriod.slot,
                    RealizationPeriod.start_date,
                    RealizationPeriod.end_date,
                    RealizationPeriod.department_id,
                ],
                index_where=RealizationPeriod.department_id.is_not(None),
            )
        )
        period = (
            await db.execute(
                select(RealizationPeriod).where(
                    RealizationPeriod.period_type == "WEEKLY",
                    RealizationPeriod.slot == "ALL",
                    RealizationPeriod.start_date == start,
                    RealizationPeriod.end_date == end,
                    RealizationPeriod.department_id == department_id,
                )
            )
        ).scalar_one()
    elif period.status == RealizationPeriodStatus.OPEN.value:
        # OPEN periods can pick up snapshots created after the initial page view.
        period.planned_snapshot_id = planned.id if planned else None
        period.final_snapshot_id = final.id if final else None
    return period, planned, final


async def ensure_daily_period(
    db: AsyncSession,
    *,
    department_id: uuid.UUID,
    day: date,
    created_by: uuid.UUID | None,
) -> tuple[RealizationPeriod, WeeklyPlannerSnapshot | None]:
    week_start = normalize_week_start(day)
    planned, _ = await select_weekly_snapshots(
        db, department_id=department_id, week_start=week_start
    )
    period = (
        await db.execute(
            select(RealizationPeriod).where(
                RealizationPeriod.period_type == "DAILY",
                RealizationPeriod.slot == "ALL",
                RealizationPeriod.start_date == day,
                RealizationPeriod.end_date == day,
                RealizationPeriod.department_id == department_id,
            )
        )
    ).scalar_one_or_none()
    if period is None:
        policy = await select_policy(db, week_start)
        await db.execute(
            pg_insert(RealizationPeriod)
            .values(
                id=uuid.uuid4(),
                period_type="DAILY",
                slot="ALL",
                start_date=day,
                end_date=day,
                department_id=department_id,
                policy_version_id=policy.id,
                planned_snapshot_id=planned.id if planned else None,
                status=RealizationPeriodStatus.OPEN.value,
                created_by=created_by,
            )
            .on_conflict_do_nothing(
                index_elements=[
                    RealizationPeriod.period_type,
                    RealizationPeriod.slot,
                    RealizationPeriod.start_date,
                    RealizationPeriod.end_date,
                    RealizationPeriod.department_id,
                ],
                index_where=RealizationPeriod.department_id.is_not(None),
            )
        )
        period = (
            await db.execute(
                select(RealizationPeriod).where(
                    RealizationPeriod.period_type == "DAILY",
                    RealizationPeriod.slot == "ALL",
                    RealizationPeriod.start_date == day,
                    RealizationPeriod.end_date == day,
                    RealizationPeriod.department_id == department_id,
                )
            )
        ).scalar_one()
    elif period.status == RealizationPeriodStatus.OPEN.value:
        period.planned_snapshot_id = planned.id if planned else None
    return period, planned


def require_unlocked(period: RealizationPeriod) -> None:
    if period.status == RealizationPeriodStatus.LOCKED.value:
        raise RealizationWorkflowError("Locked Realization periods are immutable")


def require_recalculable(period: RealizationPeriod) -> None:
    require_unlocked(period)
    if period.status not in {
        RealizationPeriodStatus.OPEN.value,
        RealizationPeriodStatus.CALCULATED.value,
    }:
        raise RealizationWorkflowError(
            "Recalculation is not allowed after manager review has started"
        )


def transition_period(
    period: RealizationPeriod,
    target: RealizationPeriodStatus,
    *,
    actor_id: uuid.UUID,
) -> None:
    require_unlocked(period)
    current = RealizationPeriodStatus(period.status)
    allowed = {
        RealizationPeriodStatus.OPEN: {RealizationPeriodStatus.CALCULATED},
        RealizationPeriodStatus.CALCULATED: {RealizationPeriodStatus.REVIEWED},
        RealizationPeriodStatus.REVIEWED: {RealizationPeriodStatus.APPROVED},
        RealizationPeriodStatus.APPROVED: {RealizationPeriodStatus.LOCKED},
        RealizationPeriodStatus.LOCKED: set(),
    }
    if target not in allowed[current]:
        raise RealizationWorkflowError(f"Invalid status transition: {current.value} -> {target.value}")
    now = datetime.now(timezone.utc)
    period.status = target.value
    if target is RealizationPeriodStatus.CALCULATED:
        period.calculated_at = now
    elif target is RealizationPeriodStatus.APPROVED:
        period.approved_at = now
        period.approved_by = actor_id
    elif target is RealizationPeriodStatus.LOCKED:
        period.locked_at = now
