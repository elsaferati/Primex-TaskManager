from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.db import get_db
from app.models.department import Department
from app.models.enums import (
    RealizationLevel,
    RealizationMarker,
    RealizationObservationCategory,
    RealizationObservationVisibility,
    RealizationPeriodStatus,
    RealizationScopeType,
    RealizationSymbol,
    UserRole,
)
from app.models.realization import (
    RealizationDepartmentResult,
    RealizationObservation,
    RealizationPeriod,
    RealizationPersonResult,
)
from app.models.task import Task
from app.models.task_user_comment import TaskUserComment
from app.models.user import User
from app.models.weekly_planner_snapshot import WeeklyPlannerSnapshot
from app.schemas.realization import (
    RealizationDepartmentResultOut,
    RealizationAIAnalysisOut,
    RealizationDailyOut,
    RealizationObservationCreate,
    RealizationObservationOut,
    RealizationObservationVerify,
    RealizationObservationVoid,
    RealizationPeriodOut,
    RealizationPersonResultOut,
    RealizationPersonWorkflowOut,
    RealizationReviewRequest,
    RealizationWeeklyOut,
)
from app.schemas.weekly_planner_snapshot import WeeklySnapshotType
from app.services.audit import add_audit_log
from app.services.realization_access import (
    can_approve_realization,
    can_lock_realization,
    can_review_realization,
    can_view_observation,
    can_view_person_result,
)
from app.services.realization_calculator import build_live_questions, calculate_weekly_period
from app.services.realization_ai import RealizationAIError, analyze_realization
from app.services.realization_daily import (
    _daily_classification,
    _local_date,
    calculate_daily_period,
)
from app.services.realization_evidence import _snapshot_tasks
from app.services.realization_excel import build_realization_workbook
from app.services.realization_periods import (
    RealizationWorkflowError,
    ensure_daily_period,
    ensure_weekly_period,
    normalize_week_start,
    require_unlocked,
    transition_period,
    weekly_end,
)
from app.services.realization_people import (
    full_period_leave_user_ids,
    load_active_users_and_common_leave,
)
from app.services.system_task_schedule import _is_working_day


router = APIRouter()


def _can_capture_current_week_final(period: RealizationPeriod, *, today: date | None = None) -> bool:
    local_today = today or datetime.now(ZoneInfo(settings.REALIZATION_TIMEZONE)).date()
    return (
        period.final_snapshot_id is None
        and normalize_week_start(local_today) == period.start_date
        and local_today >= period.end_date
    )


def _error(exc: ValueError, code: int = status.HTTP_409_CONFLICT) -> HTTPException:
    return HTTPException(status_code=code, detail=str(exc))


def _ensure_department_scope(user: User, department_id: uuid.UUID) -> None:
    # Every department manager can see and manage Realization for all
    # departments, not just their own — see realization_access.py.
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


async def _period(
    db: AsyncSession, period_id: uuid.UUID, *, for_update: bool = False
) -> RealizationPeriod:
    statement = select(RealizationPeriod).where(RealizationPeriod.id == period_id)
    if for_update:
        statement = statement.with_for_update()
    row = (
        await db.execute(statement)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Realization period not found")
    return row


async def _pinned_snapshots(
    db: AsyncSession, period: RealizationPeriod
) -> tuple[WeeklyPlannerSnapshot | None, WeeklyPlannerSnapshot | None]:
    ids = [item for item in (period.planned_snapshot_id, period.final_snapshot_id) if item]
    rows = (
        (
            await db.execute(
                select(WeeklyPlannerSnapshot).where(WeeklyPlannerSnapshot.id.in_(ids))
            )
        ).scalars().all()
        if ids
        else []
    )
    by_id = {row.id: row for row in rows}
    return by_id.get(period.planned_snapshot_id), by_id.get(period.final_snapshot_id)


async def _recalculate_after_evidence(
    db: AsyncSession, *, period: RealizationPeriod, actor_id: uuid.UUID
) -> None:
    """Keep automatic answers and grades synchronized with manager evidence."""
    if period.period_type != "WEEKLY" or period.status not in {
        RealizationPeriodStatus.OPEN.value,
        RealizationPeriodStatus.CALCULATED.value,
    }:
        return
    planned, final = await _pinned_snapshots(db, period)
    if planned is None or final is None:
        return
    # calculate_weekly_period leaves already-reviewed people's results
    # untouched and recalculates everyone else — so this can always run
    # while the period is OPEN/CALCULATED (the outer guard above already
    # stops once every person has been reviewed and the period moves to
    # REVIEWED).
    await calculate_weekly_period(
        db,
        period=period,
        planned_snapshot=planned,
        final_snapshot=final,
        actor_id=actor_id,
    )


def _visible_facts(user: User, result: RealizationPersonResult) -> dict:
    facts = dict(result.facts_json or {})
    if user.role != UserRole.STAFF:
        return facts
    facts["observations"] = [
        item
        for item in facts.get("observations") or []
        if item.get("visibility") != RealizationObservationVisibility.PRIVATE_MANAGER.value
    ]
    questions = []
    for question in facts.get("questions") or []:
        item = dict(question)
        if item.get("key") == "comments":
            for value_key in ("auto_value", "final_value"):
                value = item.get(value_key)
                if isinstance(value, dict):
                    value = dict(value)
                    value["manager_comment"] = None
                    value["override_reason"] = None
                    item[value_key] = value
        questions.append(item)
    facts["questions"] = questions
    return facts


async def _weekly_response(
    db: AsyncSession,
    *,
    period: RealizationPeriod,
    user: User,
    department_name: str | None,
) -> RealizationWeeklyOut:
    raw_rows = (
        await db.execute(
            select(RealizationPersonResult).where(
                RealizationPersonResult.period_id == period.id
            )
        )
    ).scalars().all()
    active_users, common_leave = await load_active_users_and_common_leave(
        db,
        department_id=period.department_id,
        start_date=period.start_date,
        end_date=period.end_date,
    )
    active_user_ids = {active_user.id for active_user in active_users}
    working_days: set[date] = set()
    current_day = period.start_date
    while current_day <= period.end_date:
        if _is_working_day(current_day):
            working_days.add(current_day)
        current_day += timedelta(days=1)
    excluded_on_full_leave = full_period_leave_user_ids(
        common_leave,
        working_days=working_days,
    )
    eligible_user_ids = active_user_ids - excluded_on_full_leave
    rows = [row for row in raw_rows if row.user_id in eligible_user_ids]
    visible = [
        row
        for row in rows
        if can_view_person_result(
            user,
            subject_user_id=row.user_id,
            subject_department_id=row.department_id,
        )
    ]
    names = {
        row.id: row.full_name
        for row in (
            await db.execute(
                select(User).where(User.id.in_([item.user_id for item in visible]))
            )
        ).scalars().all()
    } if visible else {}
    active_observations = (
        await db.execute(
            select(RealizationObservation).where(
                RealizationObservation.period_id == period.id,
                RealizationObservation.voided_at.is_(None),
            )
        )
    ).scalars().all()
    verified_ids: set[uuid.UUID] = set()
    for observation in active_observations:
        evidence = observation.evidence_json or {}
        if (
            observation.source_type == "realization_observation_verification"
            and evidence.get("verified") is True
        ):
            try:
                verified_ids.add(
                    uuid.UUID(str(evidence.get("verification_of") or observation.source_id))
                )
            except (TypeError, ValueError):
                pass
    live_by_user: dict[uuid.UUID, list[dict]] = {}
    for observation in active_observations:
        if (
            observation.source_type == "realization_observation_verification"
            or observation.user_id is None
        ):
            continue
        visibility = RealizationObservationVisibility(observation.visibility)
        if not can_view_observation(
            user,
            subject_user_id=observation.user_id,
            department_id=observation.department_id or period.department_id,
            visibility=visibility,
        ):
            continue
        live_by_user.setdefault(observation.user_id, []).append(
            {
                "id": str(observation.id),
                "marker": observation.marker,
                "category": observation.category,
                "comment": observation.comment,
                "task_id": str(observation.task_id) if observation.task_id else None,
                "evidence_json": observation.evidence_json or {},
                "verified": observation.id in verified_ids
                or (
                    observation.is_system_generated
                    and (observation.evidence_json or {}).get("verified") is True
                ),
                "visibility": observation.visibility,
            }
        )
    daily_rows = (
        await db.execute(
            select(RealizationPersonResult, RealizationPeriod)
            .join(RealizationPeriod, RealizationPeriod.id == RealizationPersonResult.period_id)
            .where(
                RealizationPeriod.period_type == "DAILY",
                RealizationPeriod.department_id == period.department_id,
                RealizationPeriod.start_date >= period.start_date,
                RealizationPeriod.end_date <= period.end_date,
                RealizationPeriod.status != RealizationPeriodStatus.OPEN.value,
            )
            .order_by(RealizationPeriod.start_date.asc())
        )
    ).all()
    if not visible and daily_rows:
        latest_by_user: dict[uuid.UUID, tuple[RealizationPersonResult, RealizationPeriod]] = {}
        for daily_result, daily_period in daily_rows:
            latest_by_user[daily_result.user_id] = (daily_result, daily_period)
        rows = [item[0] for item in latest_by_user.values()]
        visible = [
            row
            for row in rows
            if can_view_person_result(
                user,
                subject_user_id=row.user_id,
                subject_department_id=row.department_id,
            )
        ]
        names = {
            row.id: row.full_name
            for row in (
                await db.execute(
                    select(User).where(User.id.in_([item.user_id for item in visible]))
                )
            ).scalars().all()
        } if visible else {}
    daily_by_user: dict[uuid.UUID, list[dict]] = {}
    daily_tasks_by_user: dict[uuid.UUID, dict[str, dict]] = {}
    weekly_completed_tasks_by_user: dict[uuid.UUID, list[dict]] = {}
    for daily_result, daily_period in daily_rows:
        daily_facts = daily_result.facts_json or {}
        weekly_completed_tasks_by_user[daily_result.user_id] = [
            dict(task) for task in daily_facts.get("weekly_completed_tasks") or []
        ]
        day_tasks = [dict(task) for task in daily_facts.get("tasks") or []]
        daily_by_user.setdefault(daily_result.user_id, []).append(
            {
                "date": daily_period.start_date.isoformat(),
                "has_snapshot": True,
                "daily_progress_percent": daily_facts.get("daily_progress_percent", 0),
                "weekly_progress_percent": daily_facts.get("weekly_progress_percent", 0),
                "planned_count": daily_facts.get(
                    "daily_planned_count", daily_result.planned_count
                ),
                "completed_count": daily_facts.get(
                    "daily_completed_count", daily_result.completed_on_time_count
                ),
                "weekly_planned_count": daily_facts.get("weekly_planned_count", 0),
                "weekly_completed_count": daily_facts.get("weekly_completed_count", 0),
                "additional_count": daily_result.additional_count,
                "attendance": daily_facts.get("attendance") or [],
                "tasks": day_tasks,
            }
        )
        for task in day_tasks:
            task_key = str(task.get("task_id") or task.get("match_key") or "")
            if task_key:
                daily_tasks_by_user.setdefault(daily_result.user_id, {})[task_key] = task

    planned_tasks_by_user_day: dict[uuid.UUID, dict[str, list[dict]]] = {}
    if period.planned_snapshot_id is not None:
        planned_snapshot = await db.get(WeeklyPlannerSnapshot, period.planned_snapshot_id)
        if planned_snapshot is not None:
            for task in _snapshot_tasks(planned_snapshot).values():
                occurrences = task.get("occurrences") or []
                if not occurrences and task.get("planned_due_date"):
                    occurrences = [
                        {
                            "day": task["planned_due_date"].date(),
                            "time_slot": task.get("finish_period"),
                            "assignee_id": None,
                        }
                    ]
                for assignee in task.get("assignees") or []:
                    user_id = assignee.get("assignee_id")
                    if user_id is None:
                        continue
                    for occurrence in occurrences:
                        occurrence_day = occurrence.get("day")
                        occurrence_user_id = occurrence.get("assignee_id")
                        if (
                            occurrence_day is None
                            or occurrence_day < period.start_date
                            or occurrence_day > period.end_date
                            or occurrence_user_id not in {None, user_id}
                        ):
                            continue
                        fact = {
                            "match_key": task["match_key"],
                            "task_id": str(task["task_id"]) if task.get("task_id") else None,
                            "title": task["title"],
                            "project_id": str(task["project_id"]) if task.get("project_id") else None,
                            "project_title": task.get("project_title"),
                            "source_type": task.get("source_type") or "project",
                            "classification": "planned",
                            "status": task.get("status") or "TODO",
                            "daily_progress": [],
                            "attribution": "planned_today",
                            "planned_occurrences": [
                                {
                                    "day": occurrence_day.isoformat(),
                                    "time_slot": occurrence.get("time_slot"),
                                    "assignee_id": str(user_id),
                                }
                            ],
                        }
                        day_key = occurrence_day.isoformat()
                        planned_tasks_by_user_day.setdefault(user_id, {}).setdefault(day_key, []).append(fact)

    # System-task templates may intentionally be hidden from the Weekly Planner,
    # but Realization is an execution report and must include every generated
    # occurrence assigned to the employee. Load these independently from the
    # planner snapshot and place them on their effective due/run day.
    system_tasks_by_user_day: dict[uuid.UUID, dict[str, list[dict]]] = {}
    visible_user_ids = [row.user_id for row in visible]
    if visible_user_ids:
        range_start = datetime.combine(
            period.start_date - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
        )
        range_end = datetime.combine(
            period.end_date + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc
        )
        effective_system_date = func.coalesce(Task.due_date, Task.origin_run_at, Task.start_date)
        system_task_rows = (
            await db.execute(
                select(Task).where(
                    Task.assigned_to.in_(visible_user_ids),
                    Task.system_template_origin_id.is_not(None),
                    Task.is_active.is_(True),
                    effective_system_date >= range_start,
                    effective_system_date < range_end,
                )
            )
        ).scalars().all()
        for system_task in system_task_rows:
            if system_task.assigned_to is None:
                continue
            task_day = _local_date(
                system_task.due_date or system_task.origin_run_at or system_task.start_date
            )
            if (
                task_day is None
                or task_day < period.start_date
                or task_day > period.end_date
                or not _is_working_day(task_day)
            ):
                continue
            system_fact = {
                "match_key": f"id:{system_task.id}",
                "task_id": str(system_task.id),
                "title": system_task.title,
                "project_id": None,
                "project_title": None,
                "source_type": "system",
                "classification": _daily_classification(system_task, None, task_day),
                "status": system_task.status,
                "daily_progress": [],
                "attribution": "system_schedule",
            }
            system_tasks_by_user_day.setdefault(system_task.assigned_to, {}).setdefault(
                task_day.isoformat(), []
            ).append(system_fact)
            daily_tasks_by_user.setdefault(system_task.assigned_to, {})[
                str(system_task.id)
            ] = system_fact

    for row in visible:
        timeline = daily_by_user.setdefault(row.user_id, [])
        timeline_by_date = {item["date"]: item for item in timeline}
        current_day = period.start_date
        while current_day <= period.end_date:
            if _is_working_day(current_day):
                day_key = current_day.isoformat()
                planned_tasks = planned_tasks_by_user_day.get(row.user_id, {}).get(day_key, [])
                scheduled_system_tasks = system_tasks_by_user_day.get(row.user_id, {}).get(day_key, [])
                item = timeline_by_date.get(day_key)
                if item is None:
                    tasks_by_key = {
                        str(task.get("task_id") or task.get("match_key") or ""): task
                        for task in [*planned_tasks, *scheduled_system_tasks]
                    }
                    item = {
                        "date": day_key,
                        "has_snapshot": False,
                        "daily_progress_percent": 0,
                        "weekly_progress_percent": 0,
                        "planned_count": len(planned_tasks),
                        "completed_count": 0,
                        "weekly_planned_count": 0,
                        "weekly_completed_count": 0,
                        "additional_count": 0,
                        "attendance": [],
                        "tasks": list(tasks_by_key.values()),
                    }
                    timeline.append(item)
                    timeline_by_date[day_key] = item
                else:
                    actual_tasks = item.get("tasks") or []
                    actual_by_key = {
                        str(task.get("task_id") or task.get("match_key") or ""): task
                        for task in actual_tasks
                    }
                    merged_tasks = []
                    planned_keys: set[str] = set()
                    for planned_task in planned_tasks:
                        task_key = str(
                            planned_task.get("task_id") or planned_task.get("match_key") or ""
                        )
                        planned_keys.add(task_key)
                        merged_tasks.append({**planned_task, **actual_by_key.get(task_key, {})})
                    merged_tasks.extend(
                        task
                        for task in actual_tasks
                        if str(task.get("task_id") or task.get("match_key") or "") not in planned_keys
                    )
                    merged_keys = {
                        str(task.get("task_id") or task.get("match_key") or "")
                        for task in merged_tasks
                    }
                    merged_tasks.extend(
                        task
                        for task in scheduled_system_tasks
                        if str(task.get("task_id") or task.get("match_key") or "") not in merged_keys
                    )
                    item["tasks"] = merged_tasks
            current_day += timedelta(days=1)
        timeline.sort(key=lambda item: item["date"])

        # The latest daily snapshot carries the cumulative list of every task
        # completed during the week. Merge each one into its actual completion
        # day so older tasks outside PLANNED remain visible without being
        # misreported as newly added work.
        timeline_by_date = {item["date"]: item for item in timeline}
        for completed_task in weekly_completed_tasks_by_user.get(row.user_id, []):
            completion_day = str(completed_task.get("completion_day") or "")
            target = timeline_by_date.get(completion_day)
            if target is None:
                continue
            task_key = str(
                completed_task.get("task_id")
                or completed_task.get("match_key")
                or ""
            )
            if not task_key:
                continue
            # A task's scheduled day (from due_date/origin_run_at/start_date)
            # can differ from the day it was actually completed. Without this,
            # the same task shows up twice — once as a "scheduled" ghost entry
            # on its due day and again here on its completion day.
            for other_day in timeline:
                if other_day["date"] == completion_day:
                    continue
                other_tasks = other_day.get("tasks")
                if not other_tasks:
                    continue
                filtered = [
                    task
                    for task in other_tasks
                    if str(task.get("task_id") or task.get("match_key") or "")
                    != task_key
                ]
                if len(filtered) != len(other_tasks):
                    other_day["tasks"] = filtered
            target_tasks = target.setdefault("tasks", [])
            existing_index = next(
                (
                    index
                    for index, task in enumerate(target_tasks)
                    if str(task.get("task_id") or task.get("match_key") or "")
                    == task_key
                ),
                None,
            )
            if existing_index is None:
                target_tasks.append(completed_task)
            else:
                existing_task = target_tasks[existing_index]
                attribution = (
                    "planned_today"
                    if existing_task.get("attribution") == "planned_today"
                    else completed_task.get("attribution")
                )
                target_tasks[existing_index] = {
                    **existing_task,
                    **completed_task,
                    "attribution": attribution,
                }
            daily_tasks_by_user.setdefault(row.user_id, {})[task_key] = completed_task

    visible_task_ids: set[uuid.UUID] = set()
    for row in visible:
        for timeline_item in daily_by_user.get(row.user_id, []):
            for task in timeline_item.get("tasks") or []:
                try:
                    visible_task_ids.add(uuid.UUID(str(task.get("task_id"))))
                except (TypeError, ValueError):
                    continue
    current_task_owners: dict[uuid.UUID, set[uuid.UUID]] = {}
    if visible_task_ids:
        from app.models.task_assignee import TaskAssignee

        for task_id, owner_id in (
            await db.execute(
                select(TaskAssignee.task_id, TaskAssignee.user_id).where(
                    TaskAssignee.task_id.in_(visible_task_ids)
                )
            )
        ).all():
            current_task_owners.setdefault(task_id, set()).add(owner_id)
        for task_id, assigned_to in (
            await db.execute(
                select(Task.id, Task.assigned_to).where(Task.id.in_(visible_task_ids))
            )
        ).all():
            if assigned_to is not None and not current_task_owners.get(task_id):
                current_task_owners.setdefault(task_id, set()).add(assigned_to)

    def belongs_to_person(task: dict, user_id: uuid.UUID) -> bool:
        try:
            task_id = uuid.UUID(str(task.get("task_id")))
        except (TypeError, ValueError):
            return True
        owners = current_task_owners.get(task_id)
        return not owners or user_id in owners

    for row in visible:
        for timeline_item in daily_by_user.get(row.user_id, []):
            timeline_item["tasks"] = [
                task
                for task in timeline_item.get("tasks") or []
                if belongs_to_person(task, row.user_id)
            ]
        if row.user_id in daily_tasks_by_user:
            daily_tasks_by_user[row.user_id] = {
                key: task
                for key, task in daily_tasks_by_user[row.user_id].items()
                if belongs_to_person(task, row.user_id)
            }
    task_comment_map = {
        comment.task_id: comment.comment
        for comment in (
            await db.execute(
                select(TaskUserComment).where(
                    TaskUserComment.task_id.in_(visible_task_ids),
                    TaskUserComment.user_id == user.id,
                )
            )
        ).scalars().all()
    } if visible_task_ids else {}
    for row in visible:
        for timeline_item in daily_by_user.get(row.user_id, []):
            for task in timeline_item.get("tasks") or []:
                try:
                    task_uuid = uuid.UUID(str(task.get("task_id")))
                except (TypeError, ValueError):
                    task_uuid = None
                task["user_comment"] = task_comment_map.get(task_uuid) if task_uuid else None
    people: list[RealizationPersonWorkflowOut] = []
    for row in visible:
        payload = RealizationPersonResultOut.model_validate(row).model_dump()
        facts = _visible_facts(user, row)
        facts["tasks"] = [
            task
            for task in facts.get("tasks") or []
            if belongs_to_person(task, row.user_id)
        ]
        facts["daily_timeline"] = daily_by_user.get(row.user_id, [])
        facts["observations"] = live_by_user.get(row.user_id, [])
        if period.final_snapshot_id is None:
            facts["tasks"] = list(daily_tasks_by_user.get(row.user_id, {}).values()) or (
                facts.get("tasks") or []
            )
            facts["questions"] = build_live_questions(facts)
        payload["facts_json"] = facts
        if user.role == UserRole.STAFF:
            payload["manager_comment"] = None
            payload["override_reason"] = None
        payload["user_name"] = names.get(row.user_id, "Employee")
        people.append(RealizationPersonWorkflowOut.model_validate(payload))
    department_result = (
        await db.execute(
            select(RealizationDepartmentResult).where(
                RealizationDepartmentResult.period_id == period.id
            )
        )
    ).scalar_one_or_none()
    has_planned = period.planned_snapshot_id is not None
    has_final = period.final_snapshot_id is not None
    has_reviewed_result = any(row.reviewed_at is not None for row in rows)
    message = None
    if not has_planned:
        message = "Nuk ka PLANNED snapshot zyrtar për këtë javë."
    elif not has_final:
        message = (
            "Po shfaqet progresi aktual nga snapshot-et ditore. "
            "FINAL ruhet në mbylljen e javës për vlerësimin përfundimtar."
        )
    return RealizationWeeklyOut(
        period=RealizationPeriodOut.model_validate(period),
        department_name=department_name,
        has_planned_snapshot=has_planned,
        has_final_snapshot=has_final,
        can_calculate=(
            has_planned
            and (has_final or _can_capture_current_week_final(period))
            and period.status in {
                RealizationPeriodStatus.OPEN.value,
                RealizationPeriodStatus.CALCULATED.value,
            }
            and not has_reviewed_result
            and user.role in {UserRole.MANAGER, UserRole.ADMIN}
        ),
        message=message,
        people=people,
        department_result=(
            RealizationDepartmentResultOut.model_validate(
                {
                    **RealizationDepartmentResultOut.model_validate(
                        department_result
                    ).model_dump(),
                    "final_comment": None,
                }
            )
            if department_result and user.role == UserRole.STAFF
            else (
                RealizationDepartmentResultOut.model_validate(department_result)
                if department_result
                else None
            )
        ),
        unassigned=(department_result.facts_json or {}).get("unassigned", [])
        if department_result
        else [],
    )


@router.get("/export.xlsx")
async def export_realization_excel(
    week_start: date,
    department_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    # Every department manager can export Realization for any department,
    # or all of them at once (department_id=None), same as ADMIN.
    if user.role not in (UserRole.MANAGER, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Forbidden")

    start = normalize_week_start(week_start)
    end = weekly_end(start)
    period_statement = select(RealizationPeriod).where(
        RealizationPeriod.period_type == "WEEKLY",
        RealizationPeriod.start_date == start,
        RealizationPeriod.end_date == end,
    )
    if department_id is not None:
        period_statement = period_statement.where(
            RealizationPeriod.department_id == department_id
        )
    periods = (await db.execute(period_statement)).scalars().all()
    if not periods:
        raise HTTPException(status_code=409, detail="Nuk ka realizim të gjeneruar për këtë javë")

    department_ids = [period.department_id for period in periods if period.department_id]
    departments_by_id = {
        row.id: row.name
        for row in (
            await db.execute(select(Department).where(Department.id.in_(department_ids)))
        ).scalars().all()
    }
    managers_by_department_id: dict[uuid.UUID, str] = {}
    if department_ids:
        for manager_row in (
            await db.execute(
                select(User).where(
                    User.role == UserRole.MANAGER,
                    User.department_id.in_(department_ids),
                )
            )
        ).scalars().all():
            if manager_row.department_id is not None:
                managers_by_department_id[manager_row.department_id] = manager_row.full_name
    weekly_results = (
        await db.execute(
            select(RealizationPersonResult).where(
                RealizationPersonResult.period_id.in_([period.id for period in periods])
            )
        )
    ).scalars().all()
    working_days: set[date] = set()
    current_day = start
    while current_day <= end:
        if _is_working_day(current_day):
            working_days.add(current_day)
        current_day += timedelta(days=1)
    eligible_by_period: dict[uuid.UUID, set[uuid.UUID]] = {}
    eligible_by_department: dict[uuid.UUID, set[uuid.UUID]] = {}
    for period in periods:
        active_users, common_leave = await load_active_users_and_common_leave(
            db,
            department_id=period.department_id,
            start_date=start,
            end_date=end,
        )
        eligible_ids = {active_user.id for active_user in active_users} - (
            full_period_leave_user_ids(common_leave, working_days=working_days)
        )
        eligible_by_period[period.id] = eligible_ids
        eligible_by_department[period.department_id] = eligible_ids
    weekly_results = [
        row
        for row in weekly_results
        if row.user_id in eligible_by_period.get(row.period_id, set())
    ]
    daily_periods = (
        await db.execute(
            select(RealizationPeriod).where(
                RealizationPeriod.period_type == "DAILY",
                RealizationPeriod.start_date >= start,
                RealizationPeriod.end_date <= end,
                RealizationPeriod.department_id.in_(department_ids),
                RealizationPeriod.status != RealizationPeriodStatus.OPEN.value,
            )
        )
    ).scalars().all() if department_ids else []
    daily_period_by_id = {period.id: period for period in daily_periods}
    daily_results = (
        await db.execute(
            select(RealizationPersonResult).where(
                RealizationPersonResult.period_id.in_(list(daily_period_by_id))
            )
        )
    ).scalars().all() if daily_period_by_id else []
    timeline_by_user_department: dict[tuple[uuid.UUID, uuid.UUID | None], list[dict]] = {}
    tasks_by_user_department: dict[
        tuple[uuid.UUID, uuid.UUID | None], dict[str, dict]
    ] = {}
    latest_daily_by_user_department: dict[
        tuple[uuid.UUID, uuid.UUID | None],
        tuple[RealizationPersonResult, RealizationPeriod],
    ] = {}
    for daily in daily_results:
        daily_period = daily_period_by_id[daily.period_id]
        if daily.user_id not in eligible_by_department.get(daily.department_id, set()):
            continue
        facts = daily.facts_json or {}
        user_department_key = (daily.user_id, daily.department_id)
        timeline_by_user_department.setdefault(user_department_key, []).append(
            {
                "date": daily_period.start_date.isoformat(),
                "daily_progress_percent": facts.get("daily_progress_percent", 0),
                "weekly_progress_percent": facts.get("weekly_progress_percent", 0),
                "planned_count": facts.get(
                    "daily_planned_count", daily.planned_count
                ),
                "completed_count": facts.get(
                    "daily_completed_count", daily.completed_on_time_count
                ),
                "weekly_planned_count": facts.get("weekly_planned_count", 0),
                "weekly_completed_count": facts.get("weekly_completed_count", 0),
                "attendance": facts.get("attendance") or [],
                "additional_count": daily.additional_count,
                "weekly_additional_count": facts.get(
                    "weekly_additional_count", daily.additional_count
                ),
            }
        )
        for task in facts.get("tasks") or []:
            task_key = str(task.get("task_id") or task.get("match_key") or "")
            if task_key:
                tasks_by_user_department.setdefault(user_department_key, {})[
                    task_key
                ] = task
        latest = latest_daily_by_user_department.get(user_department_key)
        if latest is None or daily_period.start_date > latest[1].start_date:
            latest_daily_by_user_department[user_department_key] = (daily, daily_period)

    all_user_ids = {
        row.user_id for row in weekly_results
    } | {
        user_id for user_id, _ in latest_daily_by_user_department
    }
    user_names = {
        row.id: row.full_name
        for row in (
            await db.execute(select(User).where(User.id.in_(all_user_ids)))
        ).scalars().all()
    } if all_user_ids else {}

    export_observations = (
        await db.execute(
            select(RealizationObservation).where(
                RealizationObservation.period_id.in_([period.id for period in periods]),
                RealizationObservation.voided_at.is_(None),
            )
        )
    ).scalars().all()
    export_verified_ids: set[uuid.UUID] = set()
    for observation in export_observations:
        evidence = observation.evidence_json or {}
        if (
            observation.source_type == "realization_observation_verification"
            and evidence.get("verified") is True
        ):
            try:
                export_verified_ids.add(
                    uuid.UUID(str(evidence.get("verification_of") or observation.source_id))
                )
            except (TypeError, ValueError):
                pass
    export_observations_by_period_user: dict[
        tuple[uuid.UUID | None, uuid.UUID], list[dict]
    ] = {}
    for observation in export_observations:
        if (
            observation.source_type == "realization_observation_verification"
            or observation.user_id is None
        ):
            continue
        export_observations_by_period_user.setdefault(
            (observation.period_id, observation.user_id), []
        ).append(
            {
                "id": str(observation.id),
                "marker": observation.marker,
                "category": observation.category,
                "comment": observation.comment,
                "task_id": str(observation.task_id) if observation.task_id else None,
                "evidence_json": observation.evidence_json or {},
                "verified": observation.id in export_verified_ids
                or (
                    observation.is_system_generated
                    and (observation.evidence_json or {}).get("verified") is True
                ),
                "visibility": observation.visibility,
            }
        )

    results_by_period: dict[uuid.UUID, list[dict]] = {}
    live_period_ids: set[uuid.UUID] = set()
    weekly_by_period: dict[uuid.UUID, list[RealizationPersonResult]] = {}
    for row in weekly_results:
        weekly_by_period.setdefault(row.period_id, []).append(row)

    for period in periods:
        selected_rows: list[tuple[RealizationPersonResult, bool]] = [
            (row, False) for row in weekly_by_period.get(period.id, [])
        ]
        selected_user_ids = {row.user_id for row, _ in selected_rows}
        for (user_id, row_department_id), (daily, _) in latest_daily_by_user_department.items():
            if (
                row_department_id == period.department_id
                and user_id not in selected_user_ids
            ):
                selected_rows.append((daily, True))
                live_period_ids.add(period.id)

        for row, is_live_fallback in selected_rows:
            payload = RealizationPersonResultOut.model_validate(row).model_dump(mode="python")
            facts = dict(payload.get("facts_json") or {})
            facts["daily_timeline"] = sorted(
                timeline_by_user_department.get((row.user_id, row.department_id), []),
                key=lambda item: item["date"],
            )
            facts["observations"] = export_observations_by_period_user.get(
                (period.id, row.user_id), []
            )
            is_live = is_live_fallback or period.final_snapshot_id is None
            if is_live:
                live_period_ids.add(period.id)
                facts["tasks"] = list(
                    tasks_by_user_department.get(
                        (row.user_id, row.department_id), {}
                    ).values()
                ) or (facts.get("tasks") or [])
                payload["planned_count"] = int(
                    facts.get("weekly_planned_count", payload.get("planned_count", 0))
                )
                payload["completed_on_time_count"] = int(
                    facts.get(
                        "weekly_completed_count",
                        payload.get("completed_on_time_count", 0),
                    )
                )
                payload["completed_late_count"] = 0
                payload["additional_count"] = int(
                    facts.get(
                        "weekly_additional_count", payload.get("additional_count", 0)
                    )
                )
                facts["report_mode"] = "LIVE_DAILY"
                facts["questions"] = build_live_questions(facts)
            else:
                facts["report_mode"] = "FINAL_WEEKLY"
            payload["facts_json"] = facts
            payload["user_name"] = user_names.get(row.user_id, "Employee")
            results_by_period.setdefault(period.id, []).append(payload)

    export_departments = [
        {
            "name": departments_by_id.get(period.department_id, "Departamenti"),
            "manager_name": managers_by_department_id.get(period.department_id),
            "status": (
                "AKTUAL (SNAPSHOT DITOR)"
                if period.id in live_period_ids
                else period.status
            ),
            "report_mode": (
                "LIVE_DAILY" if period.id in live_period_ids else "FINAL_WEEKLY"
            ),
            "people": sorted(
                results_by_period.get(period.id, []), key=lambda item: item["user_name"]
            ),
        }
        for period in periods
    ]
    content = build_realization_workbook(
        week_start=start.isoformat(),
        week_end=end.isoformat(),
        departments=export_departments,
    )
    filename = f"REALIZIMI_JAVOR_{start.isoformat()}_{end.isoformat()}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/weekly", response_model=RealizationWeeklyOut)
async def get_weekly_realization(
    department_id: uuid.UUID,
    week_start: date,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationWeeklyOut:
    _ensure_department_scope(user, department_id)
    department = (
        await db.execute(select(Department).where(Department.id == department_id))
    ).scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    try:
        period, _, _ = await ensure_weekly_period(
            db,
            department_id=department_id,
            week_start=week_start,
            created_by=user.id,
        )
        await db.commit()
        await db.refresh(period)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    return await _weekly_response(
        db, period=period, user=user, department_name=department.name
    )


@router.post("/weekly/calculate", response_model=RealizationWeeklyOut)
async def calculate_realization(
    department_id: uuid.UUID,
    week_start: date,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationWeeklyOut:
    _ensure_department_scope(user, department_id)
    if user.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    department = (
        await db.execute(select(Department).where(Department.id == department_id))
    ).scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    try:
        period, planned, final = await ensure_weekly_period(
            db,
            department_id=department_id,
            week_start=week_start,
            created_by=user.id,
        )
        if final is None:
            if not _can_capture_current_week_final(period):
                raise RealizationWorkflowError(
                    "FINAL mund të krijohet vetëm në ditën e fundit të javës aktuale."
                )
            from app.api.routers.planners import _create_and_store_weekly_snapshot

            await _create_and_store_weekly_snapshot(
                db=db,
                user=user,
                department_id=department_id,
                week_start_date=period.start_date,
                snapshot_type=WeeklySnapshotType.FINAL,
                is_this_week=True,
            )
            period, planned, final = await ensure_weekly_period(
                db,
                department_id=department_id,
                week_start=week_start,
                created_by=user.id,
            )
        period = await _period(db, period.id, for_update=True)
        if planned is None or final is None:
            raise RealizationWorkflowError("PLANNED dhe FINAL kërkohen për kalkulimin javor")
        before = {"status": period.status}
        await calculate_weekly_period(
            db,
            period=period,
            planned_snapshot=planned,
            final_snapshot=final,
            actor_id=user.id,
        )
        add_audit_log(
            db=db,
            actor_user_id=user.id,
            entity_type="realization_period",
            entity_id=period.id,
            action="calculated",
            before=before,
            after={
                "status": period.status,
                "planned_snapshot_id": str(period.planned_snapshot_id),
                "final_snapshot_id": str(period.final_snapshot_id),
            },
        )
        await db.commit()
        await db.refresh(period)
    except (ValueError, RealizationWorkflowError) as exc:
        await db.rollback()
        raise _error(exc)
    return await _weekly_response(
        db, period=period, user=user, department_name=department.name
    )


async def _daily_response(
    db: AsyncSession,
    *,
    period: RealizationPeriod,
    department_name: str,
) -> RealizationDailyOut:
    raw_rows = (
        await db.execute(
            select(RealizationPersonResult).where(
                RealizationPersonResult.period_id == period.id
            )
        )
    ).scalars().all()
    active_users, common_leave = await load_active_users_and_common_leave(
        db,
        department_id=period.department_id,
        start_date=period.start_date,
        end_date=period.end_date,
    )
    eligible_user_ids = {
        active_user.id
        for active_user in active_users
        if active_user.id not in common_leave
        or period.start_date not in common_leave[active_user.id].days
    }
    rows = [row for row in raw_rows if row.user_id in eligible_user_ids]
    names = {
        row.id: row.full_name
        for row in (
            await db.execute(select(User).where(User.id.in_([item.user_id for item in rows])))
        ).scalars().all()
    } if rows else {}
    people = []
    for row in rows:
        payload = RealizationPersonResultOut.model_validate(row).model_dump()
        payload["user_name"] = names.get(row.user_id, "Employee")
        people.append(RealizationPersonWorkflowOut.model_validate(payload))
    department_result = (
        await db.execute(
            select(RealizationDepartmentResult).where(
                RealizationDepartmentResult.period_id == period.id
            )
        )
    ).scalar_one_or_none()
    has_planned = period.planned_snapshot_id is not None
    return RealizationDailyOut(
        period=RealizationPeriodOut.model_validate(period),
        department_name=department_name,
        has_planned_snapshot=has_planned,
        can_calculate=(
            has_planned
            and period.status in {
                RealizationPeriodStatus.OPEN.value,
                RealizationPeriodStatus.CALCULATED.value,
            }
        ),
        message=None if has_planned else "Nuk ka PLANNED snapshot zyrtar për këtë javë.",
        people=people,
        department_result=(
            RealizationDepartmentResultOut.model_validate(department_result)
            if department_result else None
        ),
    )


@router.get("/daily", response_model=RealizationDailyOut)
async def get_daily_realization(
    department_id: uuid.UUID,
    day: date,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationDailyOut:
    _ensure_department_scope(user, department_id)
    department = (
        await db.execute(select(Department).where(Department.id == department_id))
    ).scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")
    try:
        period, _ = await ensure_daily_period(
            db, department_id=department_id, day=day, created_by=user.id
        )
        await db.commit()
        await db.refresh(period)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    return await _daily_response(db, period=period, department_name=department.name)


@router.post("/daily/calculate", response_model=RealizationDailyOut)
async def calculate_daily_realization(
    department_id: uuid.UUID,
    day: date,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationDailyOut:
    _ensure_department_scope(user, department_id)
    department = (
        await db.execute(select(Department).where(Department.id == department_id))
    ).scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")
    try:
        period, planned = await ensure_daily_period(
            db, department_id=department_id, day=day, created_by=user.id
        )
        period = await _period(db, period.id, for_update=True)
        await calculate_daily_period(
            db, period=period, planned_snapshot=planned, actor_id=user.id
        )
        add_audit_log(
            db=db,
            actor_user_id=user.id,
            entity_type="realization_period",
            entity_id=period.id,
            action="daily_snapshot_calculated",
            after={"day": day.isoformat(), "status": period.status},
        )
        await db.commit()
        await db.refresh(period)
    except (ValueError, RealizationWorkflowError) as exc:
        await db.rollback()
        raise _error(exc)
    return await _daily_response(db, period=period, department_name=department.name)


@router.post(
    "/periods/{period_id}/results/{result_id}/review",
    response_model=RealizationPersonWorkflowOut,
)
async def review_person_result(
    period_id: uuid.UUID,
    result_id: uuid.UUID,
    payload: RealizationReviewRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationPersonWorkflowOut:
    period = await _period(db, period_id, for_update=True)
    if not can_review_realization(user, department_id=period.department_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if period.status != RealizationPeriodStatus.CALCULATED.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Period is not awaiting review")
    result = (
        await db.execute(
            select(RealizationPersonResult).where(
                RealizationPersonResult.id == result_id,
                RealizationPersonResult.period_id == period.id,
            )
        )
    ).scalar_one_or_none()
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person result not found")
    final_symbol = payload.final_symbol or RealizationSymbol(result.suggested_symbol)
    final_level = payload.final_level or RealizationLevel(result.suggested_level)
    decision = payload.model_copy(
        update={
            "final_symbol": final_symbol,
            "final_level": final_level,
        }
    )


    try:
        decision.validate_against_suggestion(
            suggested_symbol=RealizationSymbol(result.suggested_symbol),
            suggested_level=RealizationLevel(result.suggested_level),
        )
    except ValueError as exc:
        raise _error(exc, status.HTTP_422_UNPROCESSABLE_ENTITY)
    before = {
        "final_symbol": result.final_symbol,
        "final_level": result.final_level,
    }
    result.final_symbol = final_symbol.value
    result.final_level = final_level.value
    result.final_bonus = None
    result.manager_comment = payload.manager_comment
    result.override_reason = payload.override_reason
    result.reviewed_by = user.id
    result.reviewed_at = datetime.now(timezone.utc)
    facts = dict(result.facts_json or {})
    known_question_keys = {
        str(question.get("key"))
        for question in facts.get("questions") or []
        if question.get("key")
    }
    unknown_question_keys = set(payload.question_values) - known_question_keys
    if unknown_question_keys:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown question keys: {', '.join(sorted(unknown_question_keys))}",
        )
    questions = []
    for question in facts.get("questions") or []:
        item = dict(question)
        key = item.get("key")
        if key == "suggested_evaluation_level":
            item["final_value"] = final_level.value
            item["source_status"] = "MANAGER_CONFIRMED"
        elif key == "evaluation":
            item["final_value"] = final_symbol.value
            item["source_status"] = "MANAGER_CONFIRMED"
        elif key == "comments":
            item["final_value"] = {
                "automatic_narrative": result.auto_narrative,
                "manager_comment": payload.manager_comment,
                "override_reason": payload.override_reason,
            }
            item["source_status"] = "MANAGER_CONFIRMED"
        elif key in payload.question_values:
            item["final_value"] = payload.question_values[key]
            item["source_status"] = "MANAGER_CONFIRMED"
        questions.append(item)
    facts["questions"] = questions
    result.facts_json = facts
    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="realization_person_result",
        entity_id=result.id,
        action="reviewed",
        before=before,
        after={
            "final_symbol": result.final_symbol,
            "final_level": result.final_level,
            "override_reason": result.override_reason,
        },
    )
    await db.flush()
    remaining = (
        await db.execute(
            select(RealizationPersonResult.id).where(
                RealizationPersonResult.period_id == period.id,
                RealizationPersonResult.reviewed_at.is_(None),
            ).limit(1)
        )
    ).scalar_one_or_none()
    if remaining is None:
        transition_period(period, RealizationPeriodStatus.REVIEWED, actor_id=user.id)
    await db.commit()
    await db.refresh(result)
    subject = (
        await db.execute(select(User).where(User.id == result.user_id))
    ).scalar_one()
    out = RealizationPersonResultOut.model_validate(result).model_dump()
    out["user_name"] = subject.full_name
    return RealizationPersonWorkflowOut.model_validate(out)


@router.post(
    "/periods/{period_id}/results/{result_id}/ai-analysis",
    response_model=RealizationAIAnalysisOut,
)
async def analyze_person_result(
    period_id: uuid.UUID,
    result_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationAIAnalysisOut:
    period = await _period(db, period_id, for_update=True)
    if not can_review_realization(user, department_id=period.department_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        require_unlocked(period)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    result = (
        await db.execute(
            select(RealizationPersonResult).where(
                RealizationPersonResult.id == result_id,
            )
        )
    ).scalar_one_or_none()
    if result is None or result.department_id != period.department_id:
        raise HTTPException(status_code=404, detail="Person result not found")
    if result.period_id != period.id:
        source_period = await _period(db, result.period_id)
        if (
            source_period.period_type != "DAILY"
            or source_period.department_id != period.department_id
            or source_period.start_date < period.start_date
            or source_period.end_date > period.end_date
        ):
            raise HTTPException(status_code=404, detail="Person result not found")
    department = await db.get(Department, period.department_id)
    weekly = await _weekly_response(
        db,
        period=period,
        user=user,
        department_name=department.name if department else None,
    )
    enriched_result = next((item for item in weekly.people if item.id == result.id), None)
    analysis_facts = enriched_result.facts_json if enriched_result else (result.facts_json or {})
    try:
        analysis = await analyze_realization(
            str(result.id),
            analysis_facts,
            suggested_level=result.suggested_level,
        )
    except RealizationAIError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    facts = dict(result.facts_json or {})
    new_entry = {
        **analysis,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": str(user.id),
    }
    # Every "Gjenero analizën" click is kept, not overwritten, so a manager
    # can see how the AI's read of a person changed across the week.
    history = list(facts.get("ai_analysis_history") or [])
    history.append(new_entry)
    facts["ai_analysis_history"] = history
    facts["ai_analysis"] = new_entry
    result.facts_json = facts
    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="realization_person_result",
        entity_id=result.id,
        action="ai_analysis_generated",
        after={
            "model": analysis["model"],
            "suggested_level": analysis["suggested_level"],
            "advisory_only": True,
        },
    )
    await db.commit()
    return RealizationAIAnalysisOut.model_validate(analysis)


@router.post("/periods/{period_id}/approve", response_model=RealizationPeriodOut)
async def approve_period(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationPeriodOut:
    if not can_approve_realization(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    period = await _period(db, period_id, for_update=True)
    try:
        transition_period(period, RealizationPeriodStatus.APPROVED, actor_id=user.id)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    now = datetime.now(timezone.utc)
    results = (
        await db.execute(
            select(RealizationPersonResult).where(
                RealizationPersonResult.period_id == period.id
            )
        )
    ).scalars().all()
    for result in results:
        result.approved_by = user.id
        result.approved_at = now
    add_audit_log(
        db=db, actor_user_id=user.id, entity_type="realization_period",
        entity_id=period.id, action="approved",
        before={"status": "REVIEWED"}, after={"status": "APPROVED"},
    )
    await db.commit()
    await db.refresh(period)
    return RealizationPeriodOut.model_validate(period)


@router.post("/periods/{period_id}/lock", response_model=RealizationPeriodOut)
async def lock_period(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationPeriodOut:
    if not can_lock_realization(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    period = await _period(db, period_id, for_update=True)
    try:
        transition_period(period, RealizationPeriodStatus.LOCKED, actor_id=user.id)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    add_audit_log(
        db=db, actor_user_id=user.id, entity_type="realization_period",
        entity_id=period.id, action="locked",
        before={"status": "APPROVED"}, after={"status": "LOCKED"},
    )
    await db.commit()
    await db.refresh(period)
    return RealizationPeriodOut.model_validate(period)


@router.post("/observations", response_model=RealizationObservationOut)
async def create_observation(
    payload: RealizationObservationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationObservationOut:
    if payload.period_id is None:
        raise HTTPException(status_code=422, detail="period_id is required")
    period = await _period(db, payload.period_id, for_update=True)
    try:
        require_unlocked(period)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    _ensure_department_scope(user, period.department_id)
    subject_id = payload.user_id
    if not can_review_realization(user, department_id=period.department_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    if payload.department_id is not None and payload.department_id != period.department_id:
        raise HTTPException(status_code=422, detail="Observation department must match its period")
    if payload.scope_type in {RealizationScopeType.TASK, RealizationScopeType.SYSTEM_TASK}:
        if subject_id is None:
            raise HTTPException(status_code=422, detail="Task observations require user_id attribution")
        task = (
            await db.execute(select(Task).where(Task.id == payload.task_id))
        ).scalar_one_or_none()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
    if subject_id is not None:
        subject = (
            await db.execute(select(User).where(User.id == subject_id))
        ).scalar_one_or_none()
        if subject is None or subject.department_id != period.department_id:
            raise HTTPException(
                status_code=422,
                detail="Observation subject must belong to the period department",
            )
    observation_data = payload.model_dump(mode="python")
    observation_data["department_id"] = period.department_id
    observation = RealizationObservation(
        **observation_data,
        is_system_generated=False,
        created_by=user.id,
    )
    db.add(observation)
    await db.flush()
    add_audit_log(
        db=db, actor_user_id=user.id, entity_type="realization_observation",
        entity_id=observation.id, action="created", after={"period_id": str(period.id)},
    )
    await _recalculate_after_evidence(db, period=period, actor_id=user.id)
    await db.commit()
    await db.refresh(observation)
    return RealizationObservationOut.model_validate(observation)


@router.post("/observations/{observation_id}/verify", response_model=RealizationObservationOut)
async def verify_observation(
    observation_id: uuid.UUID,
    payload: RealizationObservationVerify,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationObservationOut:
    original = (
        await db.execute(
            select(RealizationObservation).where(
                RealizationObservation.id == observation_id,
                RealizationObservation.voided_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if original is None or original.period_id is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    if original.source_type == "realization_observation_verification":
        raise HTTPException(status_code=422, detail="Verification events cannot be verified")
    period = await _period(db, original.period_id, for_update=True)
    try:
        require_unlocked(period)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    if not can_review_realization(user, department_id=period.department_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    existing = (
        await db.execute(
            select(RealizationObservation).where(
                RealizationObservation.period_id == period.id,
                RealizationObservation.source_type == "realization_observation_verification",
                RealizationObservation.source_id == original.id,
                RealizationObservation.voided_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if existing:
        return RealizationObservationOut.model_validate(existing)
    verification = RealizationObservation(
        period_id=period.id,
        scope_type=original.scope_type,
        task_id=original.task_id,
        user_id=original.user_id,
        project_id=original.project_id,
        department_id=period.department_id,
        marker=RealizationMarker.NEUTRAL.value,
        category=RealizationObservationCategory.OTHER.value,
        comment=payload.comment,
        evidence_json={"verified": True, "verification_of": str(original.id)},
        source_type="realization_observation_verification",
        source_id=original.id,
        is_system_generated=False,
        visibility=original.visibility,
        created_by=user.id,
    )
    db.add(verification)
    await db.flush()
    add_audit_log(
        db=db, actor_user_id=user.id, entity_type="realization_observation",
        entity_id=original.id, action="verified", after={"verification_id": str(verification.id)},
    )
    await _recalculate_after_evidence(db, period=period, actor_id=user.id)
    await db.commit()
    await db.refresh(verification)
    return RealizationObservationOut.model_validate(verification)


@router.post("/observations/{observation_id}/void", response_model=RealizationObservationOut)
async def void_observation(
    observation_id: uuid.UUID,
    payload: RealizationObservationVoid,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationObservationOut:
    observation = (
        await db.execute(
            select(RealizationObservation).where(
                RealizationObservation.id == observation_id,
                RealizationObservation.voided_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if observation is None or observation.period_id is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    period = await _period(db, observation.period_id, for_update=True)
    try:
        require_unlocked(period)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    if not can_review_realization(user, department_id=period.department_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    observation.voided_at = datetime.now(timezone.utc)
    observation.voided_by = user.id
    observation.void_reason = payload.reason
    add_audit_log(
        db=db, actor_user_id=user.id, entity_type="realization_observation",
        entity_id=observation.id, action="voided",
        before={"voided_at": None}, after={"reason": payload.reason},
    )
    await _recalculate_after_evidence(db, period=period, actor_id=user.id)
    await db.commit()
    await db.refresh(observation)
    return RealizationObservationOut.model_validate(observation)
