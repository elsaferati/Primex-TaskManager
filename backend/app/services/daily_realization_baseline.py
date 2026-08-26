from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.daily_planner_snapshot import DailyPlannerSnapshot
from app.models.user import User
from app.services.realization_periods import normalize_week_start, select_weekly_snapshots


def _daily_payload(snapshot_payload: dict[str, Any], day: date) -> dict[str, Any]:
    """Reduce the canonical planner payload to immutable user/task/day facts."""
    wanted = day.isoformat()
    people: dict[str, dict[str, Any]] = {}
    for item in snapshot_payload.get("task_items") or []:
        occurrences = [row for row in item.get("occurrences") or [] if str(row.get("day")) == wanted]
        for occurrence in occurrences:
            user_id = occurrence.get("assignee_id")
            if not user_id:
                continue
            person = people.setdefault(str(user_id), {
                "user_id": str(user_id), "user_name": occurrence.get("assignee_name"), "tasks": [],
            })
            person["tasks"].append({
                "match_key": item.get("match_key"),
                "task_id": str(item.get("task_id")) if item.get("task_id") else None,
                "title": item.get("title"),
                "project_id": str(item.get("project_id")) if item.get("project_id") else None,
                "project_title": item.get("project_title"),
                "source_type": item.get("source_type") or "project",
                "original_daily_plan": wanted,
                "time_slot": occurrence.get("time_slot") or item.get("finish_period") or "ALL",
                "status_at_capture": item.get("daily_status") or item.get("status") or "TODO",
                "planned_due_date": str(item.get("planned_due_date")) if item.get("planned_due_date") else None,
                "assignee_id": str(user_id),
            })
    return {
        "version": 1,
        "day": wanted,
        "week_start": snapshot_payload.get("week_start"),
        "department": snapshot_payload.get("department_filter"),
        "people": sorted(people.values(), key=lambda row: (row.get("user_name") or "", row["user_id"])),
    }


async def ensure_daily_baseline(
    db: AsyncSession, *, department_id: uuid.UUID, day: date, actor: User,
) -> DailyPlannerSnapshot:
    """Return the existing baseline or atomically create it from Planner semantics."""
    existing = (await db.execute(select(DailyPlannerSnapshot).where(
        DailyPlannerSnapshot.department_id == department_id,
        DailyPlannerSnapshot.day_date == day,
    ))).scalar_one_or_none()
    if existing is not None:
        return existing

    # Local import avoids coupling model/service import order to the API router.
    from app.api.routers.planners import _build_weekly_snapshot_payload

    _, _, planner_payload = await _build_weekly_snapshot_payload(
        db=db, user=actor, department_id=department_id,
        week_start_date=normalize_week_start(day), is_this_week=False,
    )
    weekly, _ = await select_weekly_snapshots(
        db, department_id=department_id, week_start=normalize_week_start(day)
    )
    snapshot_id = uuid.uuid4()
    captured_at = datetime.now(timezone.utc)
    stmt = insert(DailyPlannerSnapshot).values(
        id=snapshot_id,
        department_id=department_id,
        day_date=day,
        source_weekly_snapshot_id=weekly.id if weekly else None,
        payload=_daily_payload(planner_payload, day),
        captured_at=captured_at,
        captured_by=actor.id,
    ).on_conflict_do_nothing(
        index_elements=["department_id", "day_date"]
    )
    await db.execute(stmt)
    row = (await db.execute(select(DailyPlannerSnapshot).where(
        DailyPlannerSnapshot.department_id == department_id,
        DailyPlannerSnapshot.day_date == day,
    ))).scalar_one()
    return row


async def ensure_daily_baselines_for_departments(
    db: AsyncSession, *, department_ids: set[uuid.UUID | None], day: date, actor: User,
) -> list[DailyPlannerSnapshot]:
    from zoneinfo import ZoneInfo

    # Defensive mutation fallback is only authoritative for the current local
    # workday. Never reconstruct a past or future "immutable" plan from live data.
    if day != datetime.now(ZoneInfo(settings.REALIZATION_TIMEZONE)).date():
        return []
    rows = []
    for department_id in sorted((value for value in department_ids if value), key=str):
        rows.append(await ensure_daily_baseline(
            db, department_id=department_id, day=day, actor=actor
        ))
    return rows
