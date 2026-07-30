from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, time
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.attendance_log import AttendanceLog
from app.models.audit_log import AuditLog
from app.models.enums import AttendanceType
from app.models.realization import RealizationObservation, RealizationPeriod
from app.models.task import Task
from app.models.task_daily_progress import TaskDailyProgress
from app.models.user import User
from app.models.weekly_planner_snapshot import WeeklyPlannerSnapshot


def _uuid(value: Any) -> uuid.UUID | None:
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


def _date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _status(value: Any) -> str:
    normalized = str(value or "TODO").upper().replace(" ", "_")
    return {"TO_DO": "TODO", "INPROGRESS": "IN_PROGRESS"}.get(normalized, normalized)


def _snapshot_tasks(snapshot: WeeklyPlannerSnapshot) -> dict[str, dict[str, Any]]:
    """Read the canonical match keys persisted by the existing planner."""
    rows = (snapshot.payload or {}).get("task_items") or []
    tasks: dict[str, dict[str, Any]] = {}
    for raw in rows:
        task_id = _uuid(raw.get("task_id"))
        fallback = raw.get("fallback_key") or ""
        match_key = raw.get("match_key") or (
            f"id:{task_id}" if task_id else f"fallback:{fallback}"
        )
        assignees = []
        for assignee in raw.get("assignees") or []:
            assignees.append(
                {
                    "assignee_id": _uuid(assignee.get("assignee_id")),
                    "assignee_name": assignee.get("assignee_name") or "Unassigned",
                }
            )
        occurrences = []
        for occurrence in raw.get("occurrences") or []:
            occurrences.append(
                {
                    "day": _date(occurrence.get("day")),
                    "time_slot": occurrence.get("time_slot"),
                    "assignee_id": _uuid(occurrence.get("assignee_id")),
                }
            )
        current_status = _status(raw.get("daily_status") or raw.get("status"))
        tasks[match_key] = {
            "match_key": match_key,
            "task_id": task_id,
            "title": raw.get("title") or "(Untitled task)",
            "project_id": _uuid(raw.get("project_id")),
            "project_title": raw.get("project_title"),
            "source_type": raw.get("source_type") or "project",
            "status": current_status,
            "completed_at": _datetime(raw.get("completed_at")),
            "is_completed": bool(raw.get("is_completed")) or current_status == "DONE",
            "finish_period": raw.get("finish_period"),
            "planned_due_date": _datetime(raw.get("due_date")),
            "assignees": assignees or [{"assignee_id": None, "assignee_name": "Unassigned"}],
            "occurrences": occurrences,
        }
    return tasks


def _local(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    zone = ZoneInfo(settings.APP_TIMEZONE)
    return value.replace(tzinfo=zone) if value.tzinfo is None else value.astimezone(zone)


def _iso(value: Any) -> Any:
    if isinstance(value, (date, datetime, uuid.UUID)):
        return value.isoformat() if not isinstance(value, uuid.UUID) else str(value)
    if isinstance(value, dict):
        return {key: _iso(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_iso(item) for item in value]
    return value


def _planned_deadline(
    task: dict[str, Any],
    source: Task | None,
    period: RealizationPeriod,
) -> datetime:
    zone = ZoneInfo(settings.APP_TIMEZONE)
    if task.get("planned_due_date"):
        return _local(task["planned_due_date"])  # type: ignore[return-value]
    if source and source.original_due_date:
        return _local(source.original_due_date)  # type: ignore[return-value]
    if source and source.due_date:
        return _local(source.due_date)  # type: ignore[return-value]
    days = [item["day"] for item in task["occurrences"] if item.get("day")]
    planned_day = max(days) if days else period.end_date
    finish = task.get("finish_period")
    cutoff = time(12, 0) if finish == "AM" else time(16, 0)
    return datetime.combine(planned_day, cutoff, tzinfo=zone)


def _postponement(
    source: Task | None,
    logs: list[AuditLog],
) -> tuple[str | None, list[str]]:
    if source is None or source.original_due_date is None or source.due_date is None:
        return None, []
    if source.due_date <= source.original_due_date:
        return None, []
    evidence_ids: list[str] = []
    for log in logs:
        after = log.after or {}
        action = (log.action or "").lower()
        if after.get("postponement_approved") is True or action in {
            "postponement_approved",
            "due_date_change_approved",
        }:
            evidence_ids.append(str(log.id))
            return "approved_postponement", evidence_ids
        if after.get("postponement_rejected") is True or action == "postponement_rejected":
            evidence_ids.append(str(log.id))
            return "rejected_postponement", evidence_ids
    if source.confirmation_assignee_id or source.status == "WAITING_CONFIRMATION":
        return "postponement_needs_review", evidence_ids
    return "unapproved_postponement", evidence_ids


def _verification_map(observations: list[RealizationObservation]) -> set[uuid.UUID]:
    verified: set[uuid.UUID] = set()
    for observation in observations:
        evidence = observation.evidence_json or {}
        if (
            observation.voided_at is None
            and observation.source_type == "realization_observation_verification"
            and evidence.get("verified") is True
        ):
            original_id = _uuid(evidence.get("verification_of") or observation.source_id)
            if original_id:
                verified.add(original_id)
    return verified


async def collect_weekly_evidence(
    db: AsyncSession,
    *,
    period: RealizationPeriod,
    planned_snapshot: WeeklyPlannerSnapshot,
    final_snapshot: WeeklyPlannerSnapshot,
) -> dict[str, Any]:
    planned = _snapshot_tasks(planned_snapshot)
    final = _snapshot_tasks(final_snapshot)
    task_ids = {
        task["task_id"] for task in [*planned.values(), *final.values()] if task["task_id"]
    }
    tasks = (
        (await db.execute(select(Task).where(Task.id.in_(task_ids)))).scalars().all()
        if task_ids
        else []
    )
    task_map = {task.id: task for task in tasks}
    progress_rows = (
        (
            await db.execute(
                select(TaskDailyProgress).where(
                    TaskDailyProgress.task_id.in_(task_ids),
                    TaskDailyProgress.day_date >= period.start_date,
                    TaskDailyProgress.day_date <= period.end_date,
                )
            )
        ).scalars().all()
        if task_ids
        else []
    )
    progress_by_task: dict[uuid.UUID, list[TaskDailyProgress]] = defaultdict(list)
    for row in progress_rows:
        progress_by_task[row.task_id].append(row)
    audit_rows = (
        (
            await db.execute(
                select(AuditLog).where(
                    AuditLog.entity_type == "task",
                    AuditLog.entity_id.in_(task_ids),
                )
            )
        ).scalars().all()
        if task_ids
        else []
    )
    audit_by_task: dict[uuid.UUID, list[AuditLog]] = defaultdict(list)
    for row in audit_rows:
        audit_by_task[row.entity_id].append(row)

    observations = (
        await db.execute(
            select(RealizationObservation).where(
                RealizationObservation.period_id == period.id,
                RealizationObservation.voided_at.is_(None),
            )
        )
    ).scalars().all()
    verified_ids = _verification_map(observations)
    evidence_observations = [
        row
        for row in observations
        if row.source_type != "realization_observation_verification"
    ]
    cancellation_by_task: dict[uuid.UUID, tuple[str, str]] = {}
    for observation in evidence_observations:
        if observation.id not in verified_ids or observation.task_id is None:
            continue
        kind = str((observation.evidence_json or {}).get("kind") or "").upper()
        if kind in {"CANCELLATION_APPROVED", "REMOVAL_APPROVED"}:
            cancellation_by_task[observation.task_id] = (
                "removed_or_canceled_approved",
                str(observation.id),
            )
        elif kind in {"CANCELLATION_REJECTED", "REMOVAL_UNAPPROVED"}:
            cancellation_by_task[observation.task_id] = (
                "removed_or_canceled_unapproved",
                str(observation.id),
            )

    person_names: dict[uuid.UUID, str] = {}
    people: dict[uuid.UUID, dict[str, Any]] = {}
    unassigned: list[dict[str, Any]] = []

    def ensure_person(user_id: uuid.UUID, name: str) -> dict[str, Any]:
        person_names[user_id] = name
        if user_id not in people:
            people[user_id] = {
                "user_id": user_id,
                "user_name": name,
                "tasks": [],
                "observations": [],
                "attendance": {},
                "counters": defaultdict(int),
                "needs_review": [],
            }
        return people[user_id]

    for match_key, planned_task in planned.items():
        current = final.get(match_key)
        source = task_map.get(planned_task["task_id"])
        progress = progress_by_task.get(planned_task["task_id"], []) if planned_task["task_id"] else []
        positive_delta = sum(max(0, row.completed_delta) for row in progress)
        postpone, postponement_evidence = _postponement(
            source,
            audit_by_task.get(planned_task["task_id"], []) if planned_task["task_id"] else [],
        )
        deadline = _planned_deadline(planned_task, source, period)
        classification = "needs_review"
        if current is None:
            classification = cancellation_by_task.get(
                planned_task["task_id"], ("needs_review", "")
            )[0]
        elif current["is_completed"]:
            completed_at = _local(current.get("completed_at") or (source.completed_at if source else None))
            classification = (
                "completed_on_time"
                if completed_at is None or completed_at <= deadline or postpone == "approved_postponement"
                else "completed_late"
            )
        elif postpone == "approved_postponement":
            classification = "in_progress" if current["status"] == "IN_PROGRESS" else "pending_confirmation"
        elif current["status"] == "IN_PROGRESS":
            classification = "in_progress" if positive_delta > 0 else "no_progress"
        elif current["status"] == "WAITING_CONFIRMATION":
            classification = "pending_confirmation"
        elif positive_delta <= 0:
            classification = "no_progress"
        else:
            classification = "late_open" if deadline.date() <= period.end_date else "in_progress"

        fact = {
            "match_key": match_key,
            "task_id": planned_task["task_id"],
            "title": planned_task["title"],
            "project_title": planned_task["project_title"],
            "source_type": planned_task["source_type"],
            "classification": classification,
            "status": current["status"] if current else None,
            "completed_at": current.get("completed_at") if current else None,
            "planned_deadline": deadline,
            "positive_progress_delta": positive_delta,
            "postponement": postpone,
            "postponement_evidence_ids": postponement_evidence,
            "reassignment": (
                current is not None
                and {
                    item.get("assignee_id") for item in current["assignees"]
                }
                != {item.get("assignee_id") for item in planned_task["assignees"]}
            ),
            "status_progress_inconsistent": (
                current is not None
                and current["status"] == "IN_PROGRESS"
                and positive_delta <= 0
            ),
        }
        assignees = planned_task["assignees"]
        for assignee in assignees:
            user_id = assignee["assignee_id"]
            if user_id is None:
                unassigned.append(_iso(fact))
                continue
            person = ensure_person(user_id, assignee["assignee_name"])
            person["tasks"].append(fact)
            person["counters"]["planned_count"] += 1
            person["counters"][f"{classification}_count"] += 1
            if postpone:
                person["counters"][f"{postpone}_count"] += 1
            if fact["reassignment"]:
                person["needs_review"].append(
                    {"kind": "REASSIGNMENT", "match_key": match_key}
                )
            if classification == "needs_review":
                person["needs_review"].append(
                    {"kind": "MISSING_FROM_FINAL", "match_key": match_key}
                )
            if fact["status_progress_inconsistent"]:
                person["needs_review"].append(
                    {"kind": "STATUS_WITHOUT_PROGRESS", "match_key": match_key}
                )

    for match_key, task in final.items():
        if match_key in planned:
            continue
        source = task_map.get(task["task_id"])
        created_after_baseline = (
            source is None
            or source.created_at is None
            or source.created_at >= planned_snapshot.created_at
        )
        if not created_after_baseline:
            continue
        status = task["status"]
        progress = progress_by_task.get(task["task_id"], []) if task["task_id"] else []
        positive_delta = sum(max(0, row.completed_delta) for row in progress)
        if task["is_completed"]:
            classification = "additional_completed"
        elif status == "IN_PROGRESS" and positive_delta:
            classification = "additional_in_progress"
        elif status == "WAITING_CONFIRMATION":
            classification = "additional_pending"
        else:
            classification = "additional_no_progress"
        fact = {
            "match_key": match_key,
            "task_id": task["task_id"],
            "title": task["title"],
            "project_title": task["project_title"],
            "source_type": task["source_type"],
            "classification": classification,
            "status": status,
            "completed_at": task["completed_at"],
            "positive_progress_delta": positive_delta,
        }
        for assignee in task["assignees"]:
            user_id = assignee["assignee_id"]
            if user_id is None:
                unassigned.append(_iso(fact))
                continue
            person = ensure_person(user_id, assignee["assignee_name"])
            person["tasks"].append(fact)
            person["counters"]["additional_count"] += 1
            person["counters"][f"{classification}_count"] += 1

    observation_by_user: dict[uuid.UUID, list[RealizationObservation]] = defaultdict(list)
    for observation in evidence_observations:
        if observation.user_id:
            observation_by_user[observation.user_id].append(observation)
            ensure_person(observation.user_id, person_names.get(observation.user_id, "Employee"))
    for user_id, person_observations in observation_by_user.items():
        person = people[user_id]
        for observation in person_observations:
            verified = observation.id in verified_ids or (
                observation.is_system_generated and observation.created_by is not None
            )
            item = {
                "id": observation.id,
                "marker": observation.marker,
                "category": observation.category,
                "comment": observation.comment,
                "task_id": observation.task_id,
                "evidence_json": observation.evidence_json or {},
                "verified": verified,
                "visibility": observation.visibility,
            }
            person["observations"].append(item)
            if verified:
                person["counters"][f"{observation.marker.lower()}_count"] += 1
                if observation.category == "PROPOSAL":
                    person["counters"]["proposal_count"] += 1
                if observation.category == "HELPED_COLLEAGUE":
                    person["counters"]["helped_colleague_count"] += 1
                if observation.category == "TIME_SAVED":
                    person["counters"]["time_saved_minutes"] += observation.impact_minutes or 0
                if observation.category == "REPEATED_PROBLEM":
                    person["counters"]["repeated_problem_count"] += 1
                extra_kind = str((observation.evidence_json or {}).get("kind") or "").upper()
                if observation.marker == "POSITIVE" and (
                    observation.category in {
                        "QUALITY", "TIME_SAVED", "HELPED_COLLEAGUE", "PROPOSAL"
                    }
                    or (
                        observation.category == "EXTRA_TASK"
                        and extra_kind == "COMPLETED_EXTRA_TASK"
                    )
                ):
                    person["counters"]["verified_extra_count"] += 1
                impact = (observation.evidence_json or {}).get("impact_level")
                if observation.marker == "NEGATIVE" and impact in {"MAJOR", "MULTIPLE_PEOPLE"}:
                    person["counters"]["major_negative_impact"] = 1

    user_ids = list(people)
    attendance = (
        (
            await db.execute(
                select(AttendanceLog).where(
                    AttendanceLog.user_id.in_(user_ids),
                    AttendanceLog.date >= period.start_date,
                    AttendanceLog.date <= period.end_date,
                )
            )
        ).scalars().all()
        if user_ids
        else []
    )
    for row in attendance:
        if row.user_id not in people:
            continue
        person = people[row.user_id]
        if row.type == AttendanceType.VONESE:
            person["counters"]["tardiness_count"] += 1
        elif row.type == AttendanceType.PUSHIM_VJETOR:
            person["counters"]["approved_absence_days"] += 1
        elif row.type == AttendanceType.MUNGESE:
            # The current model does not distinguish excused and unexpected absence.
            person["counters"]["absence_needs_review_count"] += 1
            person["needs_review"].append(
                {"kind": "ABSENCE_APPROVAL", "attendance_id": str(row.id)}
            )
        person["attendance"][str(row.id)] = {
            "date": row.date,
            "type": row.type.value,
            "details": row.details,
        }

    if user_ids:
        users = (
            await db.execute(select(User).where(User.id.in_(user_ids)))
        ).scalars().all()
        for user in users:
            people[user.id]["user_name"] = user.full_name

    return {
        "people": {str(user_id): _iso(facts) for user_id, facts in people.items()},
        "unassigned": unassigned,
        "department_unique_task_keys": sorted(set(planned) | set(final)),
        "planned_snapshot_id": str(planned_snapshot.id),
        "final_snapshot_id": str(final_snapshot.id),
    }
