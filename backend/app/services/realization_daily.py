from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, time, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.attendance_log import AttendanceLog
from app.models.enums import AttendanceType, RealizationPeriodStatus
from app.models.project import Project
from app.models.realization import (
    RealizationDepartmentResult,
    RealizationPeriod,
    RealizationPersonResult,
)
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.task_daily_progress import TaskDailyProgress
from app.models.weekly_planner_snapshot import WeeklyPlannerSnapshot
from app.services.realization_calculator import build_live_questions, build_project_progress
from app.services.realization_evidence import _snapshot_tasks
from app.services.realization_people import load_active_users_and_common_leave
from app.services.realization_periods import require_recalculable, transition_period


def _local_date(value: datetime | None) -> date | None:
    if value is None:
        return None
    zone = ZoneInfo(settings.REALIZATION_TIMEZONE)
    localized = value.replace(tzinfo=zone) if value.tzinfo is None else value.astimezone(zone)
    return localized.date()


def _include_nonplanned_weekly_task(
    *,
    created_at: datetime,
    planned_snapshot_at: datetime,
    completed_day: date | None,
    week_start: date,
    as_of_day: date,
) -> bool:
    """Keep new work and every task actually completed inside the report week."""
    return created_at >= planned_snapshot_at or bool(
        completed_day is not None and week_start <= completed_day <= as_of_day
    )


def _daily_classification(
    task: Task | None,
    progress: TaskDailyProgress | None,
    day: date,
) -> str:
    if task is not None and _local_date(task.completed_at) is not None:
        if _local_date(task.completed_at) <= day:  # type: ignore[operator]
            return "completed"
    status = str(progress.daily_status if progress else (task.status if task else "TODO")).upper()
    if status == "DONE":
        return "completed"
    if status == "WAITING_CONFIRMATION":
        return "pending_confirmation"
    if status == "IN_PROGRESS" or (progress and progress.completed_delta > 0):
        return "in_progress"
    return "no_progress"


def _task_fact(
    *,
    key: str,
    title: str,
    task: Task | None,
    raw: dict[str, Any] | None,
    progress: TaskDailyProgress | None,
    day: date,
    attribution: str,
) -> dict[str, Any]:
    project_id = task.project_id if task else (raw or {}).get("project_id")
    daily_progress = []
    if progress is not None:
        daily_progress.append(
            {
                "id": str(progress.id),
                "day": progress.day_date.isoformat(),
                "completed_value": progress.completed_value,
                "total_value": progress.total_value,
                "completed_delta": progress.completed_delta,
                "daily_status": progress.daily_status,
                "finish_period": progress.finish_period,
            }
        )
    source_type = (raw or {}).get("source_type")
    if not source_type and task is not None:
        source_type = "system" if task.system_template_origin_id else (
            "project" if task.project_id else "fast"
        )
    return {
        "match_key": key,
        "task_id": str(task.id) if task else (
            str((raw or {}).get("task_id")) if (raw or {}).get("task_id") else None
        ),
        "title": title,
        "project_id": str(project_id) if project_id else None,
        "project_title": (raw or {}).get("project_title"),
        "source_type": source_type or "project",
        "classification": _daily_classification(task, progress, day),
        "status": task.status if task else (raw or {}).get("status"),
        "daily_progress": daily_progress,
        "attribution": attribution,
        "evidence_ids": [str(progress.id)] if progress else [],
    }


async def calculate_daily_period(
    db: AsyncSession,
    *,
    period: RealizationPeriod,
    planned_snapshot: WeeklyPlannerSnapshot,
    actor_id: uuid.UUID,
) -> tuple[list[RealizationPersonResult], RealizationDepartmentResult]:
    """Persist an immutable-by-day operational snapshot for one department."""
    require_recalculable(period)
    if planned_snapshot is None:
        raise ValueError("PLANNED snapshot is required for daily realization")

    day = period.start_date
    planned = _snapshot_tasks(planned_snapshot)
    planned_ids = {row["task_id"] for row in planned.values() if row.get("task_id")}

    department_users, common_leave = await load_active_users_and_common_leave(
        db,
        department_id=period.department_id,
        start_date=day,
        end_date=day,
    )
    department_user_ids = {user.id for user in department_users}

    zone = ZoneInfo(settings.REALIZATION_TIMEZONE)
    day_end_local = datetime.combine(day, time.max, tzinfo=zone)
    day_end_utc = day_end_local.astimezone(timezone.utc)
    task_query = select(Task).where(
        or_(
            Task.department_id == period.department_id,
            Task.id.in_(planned_ids),
            and_(
                Task.system_template_origin_id.is_not(None),
                Task.assigned_to.in_(department_user_ids),
            ),
        ),
        Task.created_at <= day_end_utc,
    )
    tasks = (await db.execute(task_query)).scalars().all()
    task_by_id = {task.id: task for task in tasks}
    project_ids = {task.project_id for task in tasks if task.project_id}
    project_titles = {
        project.id: project.title
        for project in (
            await db.execute(select(Project).where(Project.id.in_(project_ids)))
        ).scalars().all()
    } if project_ids else {}
    relevant_ids = set(task_by_id) | planned_ids
    progress_rows = (
        (
            await db.execute(
                select(TaskDailyProgress)
                .where(
                    TaskDailyProgress.task_id.in_(relevant_ids),
                    TaskDailyProgress.day_date <= day,
                )
                .order_by(
                    TaskDailyProgress.task_id.asc(),
                    TaskDailyProgress.day_date.asc(),
                    TaskDailyProgress.id.asc(),
                )
            )
        ).scalars().all()
        if relevant_ids
        else []
    )
    latest_progress: dict[uuid.UUID, TaskDailyProgress] = {}
    daily_progress: dict[uuid.UUID, TaskDailyProgress] = {}
    for row in progress_rows:
        latest_progress[row.task_id] = row
        if row.day_date == day:
            daily_progress[row.task_id] = row

    assignee_rows = (
        (
            await db.execute(select(TaskAssignee).where(TaskAssignee.task_id.in_(relevant_ids)))
        ).scalars().all()
        if relevant_ids
        else []
    )
    assignees: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    for row in assignee_rows:
        assignees[row.task_id].add(row.user_id)
    for task in tasks:
        if task.assigned_to and not assignees.get(task.id):
            assignees[task.id].add(task.assigned_to)

    excluded_on_leave = {
        user_id for user_id, leave in common_leave.items() if day in leave.days
    }
    eligible_users = [
        user for user in department_users if user.id not in excluded_on_leave
    ]
    user_names = {user.id: user.full_name for user in eligible_users}
    people: dict[uuid.UUID, dict[str, Any]] = {
        user_id: {
            "user_id": str(user_id),
            "user_name": name,
            "date": day.isoformat(),
            "tasks": [],
            "attendance": [],
            "counters": defaultdict(int),
            "questions": [],
        }
        for user_id, name in user_names.items()
    }

    weekly_task_keys_by_user: dict[uuid.UUID, set[str]] = defaultdict(set)
    weekly_completed_by_user: dict[uuid.UUID, set[str]] = defaultdict(set)
    weekly_all_completed_by_user: dict[uuid.UUID, dict[str, dict[str, Any]]] = defaultdict(dict)
    weekly_additional_keys_by_user: dict[uuid.UUID, set[str]] = defaultdict(set)
    weekly_fast_task_keys_by_user: dict[uuid.UUID, set[str]] = defaultdict(set)
    week_start = planned_snapshot.week_start_date

    progress_completion_day: dict[uuid.UUID, date] = {}
    for row in progress_rows:
        if str(row.daily_status or "").upper() != "DONE":
            continue
        previous = progress_completion_day.get(row.task_id)
        if previous is None or row.day_date < previous:
            progress_completion_day[row.task_id] = row.day_date

    def completion_day(task: Task | None, raw: dict[str, Any] | None = None) -> date | None:
        task_day = _local_date(task.completed_at) if task is not None else None
        if task_day is not None:
            return task_day
        if task is not None and task.id in progress_completion_day:
            return progress_completion_day[task.id]
        return _local_date((raw or {}).get("completed_at"))

    def remember_weekly_completion(
        *,
        user_id: uuid.UUID,
        key: str,
        fact: dict[str, Any],
        completed_day: date | None,
    ) -> None:
        if completed_day is None or completed_day < week_start or completed_day > day:
            return
        fact["completion_day"] = completed_day.isoformat()
        weekly_all_completed_by_user[user_id][key] = fact

    for key, raw in planned.items():
        task = task_by_id.get(raw.get("task_id"))
        progress = daily_progress.get(raw.get("task_id"))
        occurrence_users: dict[uuid.UUID, bool] = {}
        task_id = raw.get("task_id")
        current_owner_ids = assignees.get(task_id, set()) if task_id else set()
        snapshot_owner_ids = {
            assignment.get("assignee_id")
            for assignment in raw.get("assignees") or []
            if assignment.get("assignee_id")
        }
        owner_ids = current_owner_ids or snapshot_owner_ids
        occurrences = raw.get("occurrences") or []
        for user_id in owner_ids:
            # Ownership comes from the live assignment table. Snapshot occurrence
            # assignees are historical and must not leak another person's task.
            occurrence_users[user_id] = any(
                occurrence.get("day") == day for occurrence in occurrences
            ) or (
                not occurrences and _local_date(raw.get("planned_due_date")) == day
            )
        for user_id, due_today in occurrence_users.items():
            if user_id not in people:
                continue
            weekly_task_keys_by_user[user_id].add(key)
            latest = latest_progress.get(raw.get("task_id"))
            completed_as_of_day = (
                task is not None
                and _local_date(task.completed_at) is not None
                and _local_date(task.completed_at) <= day  # type: ignore[operator]
            ) or (latest is not None and latest.daily_status == "DONE")
            if completed_as_of_day:
                weekly_completed_by_user[user_id].add(key)
                completed_day = completion_day(task, raw)
                completion_fact = _task_fact(
                    key=key,
                    title=raw["title"],
                    task=task,
                    raw=raw,
                    progress=latest,
                    day=day,
                    attribution="completed_from_weekly_plan",
                )
                remember_weekly_completion(
                    user_id=user_id,
                    key=key,
                    fact=completion_fact,
                    completed_day=completed_day,
                )
            if not due_today:
                continue
            fact = _task_fact(
                key=key,
                title=raw["title"],
                task=task,
                raw=raw,
                progress=progress,
                day=day,
                attribution="planned_today",
            )
            people[user_id]["tasks"].append(fact)
            people[user_id]["counters"]["planned_count"] += 1
            people[user_id]["counters"][f"{fact['classification']}_count"] += 1
            if fact["source_type"] == "system":
                people[user_id]["counters"]["system_task_count"] += 1
                if fact["classification"] == "completed":
                    people[user_id]["counters"]["system_task_completed_count"] += 1

    for task in tasks:
        is_system_task = task.system_template_origin_id is not None
        if task.id in planned_ids:
            continue
        if _local_date(task.created_at) > day:  # type: ignore[operator]
            continue

        created_after_plan = task.created_at >= planned_snapshot.created_at
        completed_day = completion_day(task)
        completed_this_week = bool(
            completed_day is not None and week_start <= completed_day <= day
        )
        if not is_system_task and not _include_nonplanned_weekly_task(
            created_at=task.created_at,
            planned_snapshot_at=planned_snapshot.created_at,
            completed_day=completed_day,
            week_start=week_start,
            as_of_day=day,
        ):
            continue

        source_type = "system" if is_system_task else (
            "project" if task.project_id else "fast"
        )
        for user_id in assignees.get(task.id, set()):
            if user_id not in people:
                continue
            if not is_system_task and created_after_plan:
                weekly_additional_keys_by_user[user_id].add(str(task.id))
                if source_type == "fast":
                    weekly_fast_task_keys_by_user[user_id].add(str(task.id))
            if completed_this_week:
                completion_fact = _task_fact(
                    key=f"id:{task.id}",
                    title=task.title,
                    task=task,
                    raw={
                        "project_title": project_titles.get(task.project_id),
                        "source_type": source_type,
                    },
                    progress=latest_progress.get(task.id),
                    day=day,
                    attribution=(
                        "system_schedule"
                        if is_system_task
                        else (
                            "added_after_weekly_plan"
                            if created_after_plan
                            else "completed_outside_weekly_plan"
                        )
                    ),
                )
                remember_weekly_completion(
                    user_id=user_id,
                    key=f"id:{task.id}",
                    fact=completion_fact,
                    completed_day=completed_day,
                )

        scheduled_system_day = _local_date(task.due_date or task.origin_run_at)
        has_activity_today = (
            _local_date(task.created_at) == day
            or _local_date(task.completed_at) == day
            or task.id in daily_progress
        )
        if is_system_task:
            if scheduled_system_day != day and not has_activity_today:
                continue
        elif not has_activity_today:
            continue

        for user_id in assignees.get(task.id, set()):
            if user_id not in people:
                continue
            fact = _task_fact(
                key=f"id:{task.id}",
                title=task.title,
                task=task,
                raw={
                    "project_title": project_titles.get(task.project_id),
                    "source_type": source_type,
                },
                progress=daily_progress.get(task.id),
                day=day,
                attribution=(
                    "system_schedule" if is_system_task else "added_after_weekly_plan"
                ),
            )
            people[user_id]["tasks"].append(fact)
            if is_system_task:
                people[user_id]["counters"]["system_task_count"] += 1
                if fact["classification"] == "completed":
                    people[user_id]["counters"]["system_task_completed_count"] += 1
            else:
                people[user_id]["counters"]["additional_count"] += 1
            if fact["source_type"] == "fast":
                people[user_id]["counters"]["fast_task_count"] += 1

    attendance = (
        await db.execute(
            select(AttendanceLog).where(
                AttendanceLog.user_id.in_(list(people)), AttendanceLog.date == day
            )
        )
    ).scalars().all() if people else []
    for row in attendance:
        person = people.get(row.user_id)
        if person is None:
            continue
        person["attendance"].append(
            {"id": str(row.id), "type": row.type.value, "details": row.details}
        )
        if row.type == AttendanceType.VONESE:
            person["counters"]["tardiness_count"] += 1
        elif row.type == AttendanceType.PUSHIM_VJETOR:
            person["counters"]["annual_leave_days"] += 1
            person["counters"]["approved_absence_days"] += 1
        elif row.type == AttendanceType.MUNGESE:
            person["counters"]["absence_needs_review_count"] += 1

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
    for user_id, stale_result in existing.items():
        if user_id not in people:
            await db.delete(stale_result)
    results: list[RealizationPersonResult] = []
    for user_id, person in people.items():
        counters = dict(person["counters"])
        planned_today = int(counters.get("planned_count", 0))
        completed_today = int(counters.get("completed_count", 0))
        weekly_total = len(weekly_task_keys_by_user[user_id])
        weekly_completed = len(weekly_completed_by_user[user_id])
        weekly_all_completed = len(weekly_all_completed_by_user[user_id])
        counters["daily_planned_count"] = planned_today
        counters["daily_completed_count"] = completed_today
        counters["weekly_planned_count"] = weekly_total
        counters["weekly_completed_count"] = weekly_completed
        counters["weekly_all_completed_count"] = weekly_all_completed
        counters["weekly_completed_outside_plan_count"] = max(
            0, weekly_all_completed - weekly_completed
        )
        counters["weekly_additional_count"] = len(weekly_additional_keys_by_user[user_id])
        counters["weekly_fast_task_count"] = len(weekly_fast_task_keys_by_user[user_id])
        person["counters"] = counters
        person["daily_planned_count"] = planned_today
        person["daily_completed_count"] = completed_today
        person["weekly_planned_count"] = weekly_total
        person["weekly_completed_count"] = weekly_completed
        person["weekly_all_completed_count"] = weekly_all_completed
        person["weekly_completed_outside_plan_count"] = max(
            0, weekly_all_completed - weekly_completed
        )
        person["weekly_completed_tasks"] = list(
            weekly_all_completed_by_user[user_id].values()
        )
        person["weekly_additional_count"] = len(weekly_additional_keys_by_user[user_id])
        person["weekly_fast_task_count"] = len(weekly_fast_task_keys_by_user[user_id])
        person["daily_progress_percent"] = (
            round(completed_today * 100.0 / planned_today, 1) if planned_today else 0.0
        )
        person["weekly_progress_percent"] = (
            round(weekly_completed * 100.0 / weekly_total, 1) if weekly_total else 0.0
        )
        person["project_progress"] = build_project_progress(person["tasks"])
        person["questions"] = build_live_questions(person)
        result = existing.get(user_id)
        if result is None:
            result = RealizationPersonResult(
                period_id=period.id,
                user_id=user_id,
                department_id=period.department_id,
            )
            db.add(result)
        previous_ai_analysis = (result.facts_json or {}).get("ai_analysis")
        if previous_ai_analysis:
            person["ai_analysis"] = previous_ai_analysis
        result.facts_json = person
        result.planned_count = planned_today
        result.completed_on_time_count = completed_today
        result.in_progress_count = int(counters.get("in_progress_count", 0))
        result.pending_count = int(counters.get("pending_confirmation_count", 0))
        result.no_progress_count = int(counters.get("no_progress_count", 0))
        result.additional_count = int(counters.get("additional_count", 0))
        result.system_task_count = int(counters.get("system_task_count", 0))
        result.system_task_completed_count = int(
            counters.get("system_task_completed_count", 0)
        )
        result.tardiness_count = int(counters.get("tardiness_count", 0))
        result.approved_absence_days = int(counters.get("approved_absence_days", 0))
        result.suggested_symbol = None
        result.suggested_level = None
        result.suggested_bonus = None
        results.append(result)

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
        "date": day.isoformat(),
        "people_count": len(results),
        "planned_count": sum(row.planned_count for row in results),
        "completed_count": sum(row.completed_on_time_count for row in results),
        "additional_count": sum(row.additional_count for row in results),
        "source_planned_snapshot_id": str(planned_snapshot.id),
        "excluded_people": [
            {
                "user_id": str(user.id),
                "user_name": user.full_name,
                "reason": "ANNUAL_LEAVE_COMMON_VIEW",
                "common_entry_ids": [
                    str(entry_id) for entry_id in common_leave[user.id].entry_ids
                ],
            }
            for user in department_users
            if user.id in excluded_on_leave
        ],
    }
    department_result.total_bonus = None
    department_result.average_bonus = None
    if period.status == RealizationPeriodStatus.OPEN.value:
        transition_period(period, RealizationPeriodStatus.CALCULATED, actor_id=actor_id)
    else:
        period.calculated_at = datetime.now(timezone.utc)
    await db.flush()
    return results, department_result
