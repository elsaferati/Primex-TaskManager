from __future__ import annotations

import uuid
from collections import Counter

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import RealizationPeriodStatus
from app.models.realization import (
    RealizationDepartmentResult,
    RealizationPeriod,
    RealizationPersonResult,
)
from app.services.realization_periods import require_recalculable, transition_period
from app.services.realization_pulse import aggregate_monthly_pulses


async def calculate_monthly_period(
    db: AsyncSession,
    *,
    period: RealizationPeriod,
    actor_id: uuid.UUID,
) -> list[RealizationPersonResult]:
    if period.period_type != "MONTHLY" or period.department_id is None:
        raise ValueError("A department MONTHLY period is required")
    require_recalculable(period)
    weekly_rows = (
        await db.execute(
            select(RealizationPersonResult, RealizationPeriod)
            .join(RealizationPeriod, RealizationPeriod.id == RealizationPersonResult.period_id)
            .where(
                RealizationPeriod.department_id == period.department_id,
                RealizationPeriod.period_type == "WEEKLY",
                RealizationPeriod.final_snapshot_id.is_not(None),
                RealizationPeriod.start_date <= period.end_date,
                RealizationPeriod.end_date >= period.start_date,
                RealizationPeriod.status != RealizationPeriodStatus.OPEN.value,
            )
            .order_by(RealizationPeriod.start_date.asc())
        )
    ).all()
    by_user: dict[uuid.UUID, list[dict]] = {}
    for weekly_result, weekly_period in weekly_rows:
        facts = weekly_result.facts_json or {}
        pulse = (facts.get("pulse") or {}).get("pulse") or "OK"
        by_user.setdefault(weekly_result.user_id, []).append(
            {
                "period_id": str(weekly_period.id),
                "week_start": weekly_period.start_date.isoformat(),
                "week_end": weekly_period.end_date.isoformat(),
                "pulse": pulse,
                "unresolved_pink_days": 1 if int(facts.get("unresolved_pink_count") or 0) else 0,
                "verified_positive_extras": int((facts.get("pulse") or {}).get("verified_extra_count") or 0),
                "unresolved_negative_count": int((facts.get("pulse") or {}).get("unresolved_negative_count") or 0),
                "verified_negative_count": int((facts.get("counters") or {}).get("negative_count") or 0),
                "drilldown": {"week_start": weekly_period.start_date.isoformat()},
            }
        )
    existing = {
        row.user_id: row
        for row in (
            await db.execute(
                select(RealizationPersonResult).where(
                    RealizationPersonResult.period_id == period.id
                )
            )
        ).scalars().all()
    }
    for user_id, stale in existing.items():
        if user_id not in by_user:
            await db.delete(stale)
    results: list[RealizationPersonResult] = []
    pulse_counts: Counter[str] = Counter()
    for user_id, rows in by_user.items():
        aggregation = aggregate_monthly_pulses(rows)
        result = existing.get(user_id)
        if result is None:
            result = RealizationPersonResult(
                period_id=period.id,
                user_id=user_id,
                department_id=period.department_id,
            )
            db.add(result)
        result.facts_json = {
            "report_mode": "MONTHLY_OPERATIONAL",
            "aggregation": aggregation,
            "source_weekly_period_ids": [row["period_id"] for row in rows],
        }
        result.suggested_symbol = None
        result.suggested_level = None
        result.final_symbol = None
        result.final_level = None
        results.append(result)
        pulse_counts[aggregation["current_pulse"]] += 1
    department_result = (
        await db.execute(
            select(RealizationDepartmentResult).where(
                RealizationDepartmentResult.period_id == period.id,
                RealizationDepartmentResult.department_id == period.department_id,
            )
        )
    ).scalar_one_or_none()
    if department_result is None:
        department_result = RealizationDepartmentResult(
            period_id=period.id, department_id=period.department_id
        )
        db.add(department_result)
    department_result.facts_json = {
        "report_mode": "MONTHLY_OPERATIONAL",
        "people_count": len(results),
        "pulse_counts": dict(pulse_counts),
    }
    if period.status == RealizationPeriodStatus.OPEN.value:
        transition_period(period, RealizationPeriodStatus.CALCULATED, actor_id=actor_id)
    await db.flush()
    return results
