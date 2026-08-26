from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, time, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.audit_log import AuditLog
from app.models.daily_plan_adjustment import DailyPlanAdjustment
from app.models.daily_planner_snapshot import DailyPlannerSnapshot
from app.models.project import Project
from app.models.realization import RealizationDailyCloseEvent, RealizationPeriod
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.task_daily_progress import TaskDailyProgress
from app.models.task_daily_rlz_state import TaskDailyRlzState
from app.models.user import User
from app.services.daily_realization_classifier import (
    DailyClassificationInput, EXCEPTION_CLASSIFICATIONS, classify_daily_task,
)
from app.services.daily_realization_metrics import calculate_daily_metrics
from app.services.daily_realization_events import semantic_local_day
from app.services.daily_realization_explanation import requires_daily_explanation


def local_day(value: datetime | None) -> date | None:
    if value is None:
        return None
    zone = ZoneInfo(settings.REALIZATION_TIMEZONE)
    aware = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    return aware.astimezone(zone).date()


def day_bounds(day: date) -> tuple[datetime, datetime]:
    zone = ZoneInfo(settings.REALIZATION_TIMEZONE)
    start = datetime.combine(day, time.min, tzinfo=zone).astimezone(timezone.utc)
    end = datetime.combine(day, time.max, tzinfo=zone).astimezone(timezone.utc)
    return start, end


def candidate_task_ids_for_person(
    person_id: uuid.UUID,
    *,
    baseline_by_user: dict[uuid.UUID, dict[uuid.UUID, dict]],
    current_assignees: dict[uuid.UUID, set[uuid.UUID]],
    tasks: dict[uuid.UUID, Any],
    events_by_task: dict[uuid.UUID, list[AuditLog]],
    day: date,
) -> set[uuid.UUID]:
    """Keep baseline, current, created-today, and intermediate-owner history."""
    candidate_ids = set(baseline_by_user.get(person_id, {}))
    candidate_ids.update(
        task_id for task_id, owners in current_assignees.items()
        if person_id in owners and (
            task_id in baseline_by_user.get(person_id, {})
            or local_day(tasks.get(task_id).created_at if tasks.get(task_id) else None) == day
            or bool(events_by_task.get(task_id))
        )
    )
    candidate_ids.update(
        task_id for task_id, task_events in events_by_task.items()
        if any(
            event.action == "task.assignee_changed"
            and str(person_id) in set((event.before or {}).get("assignee_ids", [])) | set((event.after or {}).get("assignee_ids", []))
            for event in task_events
        )
    )
    return candidate_ids


def timeline_from_events(*, day: date, baseline_task: dict | None, events: list[AuditLog]) -> list[dict]:
    rows: list[dict[str, Any]] = []
    if baseline_task:
        rows.append({
            "id": f"plan:{baseline_task.get('match_key')}", "type": "PLANNED_FOR_DAY",
            "timestamp": None, "actor_user_id": None,
            "old_value": None, "new_value": baseline_task.get("original_daily_plan"),
            "metadata": {"time_slot": baseline_task.get("time_slot")},
        })
    postponements = 0
    for event in sorted(events, key=lambda row: (row.created_at, str(row.id))):
        old = event.before or {}
        new = event.after or {}
        event_type = event.action.removeprefix("task.").upper()
        if event.action == "task.due_date_changed":
            old_value, new_value = old.get("value"), new.get("value")
            old_day, new_day = semantic_local_day(old_value), semantic_local_day(new_value)
            if old_day and new_day:
                if new_day > old_day:
                    postponements += 1
                    event_type = "POSTPONED_AGAIN" if postponements > 1 else "POSTPONED"
                elif new_day == day:
                    event_type = "MOVED_BACK_TO_TODAY"
                else:
                    event_type = "MOVED_EARLIER"
        elif event.action == "task.status_changed":
            if str(new.get("value")).upper() == "DONE": event_type = "COMPLETED"
            elif str(new.get("value")).upper() == "IN_PROGRESS": event_type = "STARTED"
        rows.append({
            "id": str(event.id), "type": event_type,
            "timestamp": event.created_at.isoformat(),
            "actor_user_id": str(event.actor_user_id) if event.actor_user_id else None,
            "old_value": old.get("value", old.get("assignee_ids")),
            "new_value": new.get("value", new.get("assignee_ids")),
            "metadata": {"reason": new.get("reason") or old.get("reason")},
        })
    return rows


async def build_live_daily_realization(
    db: AsyncSession, *, department_id: uuid.UUID, day: date,
    user_id: uuid.UUID | None = None, exceptions_only: bool = False,
) -> dict[str, Any]:
    baseline = (await db.execute(select(DailyPlannerSnapshot).where(
        DailyPlannerSnapshot.department_id == department_id,
        DailyPlannerSnapshot.day_date == day,
    ))).scalar_one_or_none()
    baseline_people = (baseline.payload or {}).get("people", []) if baseline else []
    baseline_by_user: dict[uuid.UUID, dict[uuid.UUID, dict]] = defaultdict(dict)
    task_ids: set[uuid.UUID] = set()
    for person in baseline_people:
        try: owner = uuid.UUID(str(person["user_id"]))
        except (KeyError, ValueError): continue
        for item in person.get("tasks") or []:
            try: task_id = uuid.UUID(str(item.get("task_id")))
            except (TypeError, ValueError): continue
            baseline_by_user[owner][task_id] = item
            task_ids.add(task_id)

    department_users = (await db.execute(select(User).where(
        User.department_id == department_id,
        User.is_active.is_(True),
    ))).scalars().all()
    department_user_ids = {row.id for row in department_users}

    scoped_task_ids = set(task_ids)
    if department_user_ids:
        scoped_task_ids.update((await db.execute(
            select(Task.id).outerjoin(TaskAssignee, TaskAssignee.task_id == Task.id).where(or_(
                Task.assigned_to.in_(department_user_ids),
                TaskAssignee.user_id.in_(department_user_ids),
            )).distinct()
        )).scalars().all())

    start_utc, end_utc = day_bounds(day)
    events = list((await db.execute(select(AuditLog).where(
        AuditLog.entity_type == "task",
        AuditLog.entity_id.in_(scoped_task_ids) if scoped_task_ids else False,
        AuditLog.created_at >= start_utc,
        AuditLog.created_at <= end_utc,
    ).order_by(AuditLog.created_at, AuditLog.id))).scalars().all())
    # A person can be an intermediate owner (A -> B -> C) and therefore be in
    # neither the baseline nor current assignment. Preserve that day history.
    if department_user_ids:
        department_user_keys = {str(value) for value in department_user_ids}
        assignee_history = (await db.execute(select(AuditLog).where(
            AuditLog.entity_type == "task",
            AuditLog.action == "task.assignee_changed",
            AuditLog.created_at >= start_utc,
            AuditLog.created_at <= end_utc,
        ).order_by(AuditLog.created_at, AuditLog.id))).scalars().all()
        known_event_ids = {event.id for event in events}
        for event in assignee_history:
            event_users = set((event.before or {}).get("assignee_ids", [])) | set((event.after or {}).get("assignee_ids", []))
            if event.id not in known_event_ids and event_users.intersection(department_user_keys):
                events.append(event)
        events.sort(key=lambda row: (row.created_at, str(row.id)))
    events_by_task: dict[uuid.UUID, list[AuditLog]] = defaultdict(list)
    for event in events:
        events_by_task[event.entity_id].append(event)
        task_ids.add(event.entity_id)

    current_rows = (await db.execute(
        select(Task).outerjoin(TaskAssignee, TaskAssignee.task_id == Task.id).where(or_(
            Task.id.in_(task_ids) if task_ids else False,
            and_(
                Task.created_at >= start_utc, Task.created_at <= end_utc,
                or_(
                    Task.assigned_to.in_(department_user_ids) if department_user_ids else False,
                    TaskAssignee.user_id.in_(department_user_ids) if department_user_ids else False,
                ),
            ),
        )).distinct()
    )).scalars().all()
    tasks = {row.id: row for row in current_rows}
    task_ids.update(tasks)
    assignee_rows = (await db.execute(select(TaskAssignee).where(
        TaskAssignee.task_id.in_(task_ids)
    ))).scalars().all() if task_ids else []
    current_assignees: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    for row in assignee_rows: current_assignees[row.task_id].add(row.user_id)
    for task in tasks.values():
        if task.assigned_to: current_assignees[task.id].add(task.assigned_to)

    progress_rows = (await db.execute(select(TaskDailyProgress).where(
        TaskDailyProgress.task_id.in_(task_ids), TaskDailyProgress.day_date == day,
    ))).scalars().all() if task_ids else []
    progress = {row.task_id: row for row in progress_rows}

    person_ids = set(baseline_by_user) | department_user_ids
    for task_id, owners in current_assignees.items():
        if task_id in tasks and local_day(tasks[task_id].created_at) == day:
            person_ids.update(owners)
        for event in events_by_task.get(task_id, []):
            if event.action == "task.assignee_changed":
                person_ids.update(uuid.UUID(value) for value in (event.after or {}).get("assignee_ids", []))
                person_ids.update(uuid.UUID(value) for value in (event.before or {}).get("assignee_ids", []))
    if user_id: person_ids &= {user_id}

    actor_ids = {event.actor_user_id for event in events if event.actor_user_id}
    all_visible_user_ids = person_ids | actor_ids
    users = {row.id: row for row in (await db.execute(select(User).where(User.id.in_(all_visible_user_ids)))).scalars().all()} if all_visible_user_ids else {}
    project_ids = {task.project_id for task in tasks.values() if task.project_id}
    projects = {row.id: row for row in (await db.execute(select(Project).where(Project.id.in_(project_ids)))).scalars().all()} if project_ids else {}
    states = {(row.user_id, row.task_id): row for row in (await db.execute(select(TaskDailyRlzState).where(
        TaskDailyRlzState.user_id.in_(person_ids), TaskDailyRlzState.day_date == day,
    ))).scalars().all()} if person_ids else {}
    adjustments = {(row.user_id, row.audit_event_id): row for row in (await db.execute(select(DailyPlanAdjustment).where(
        DailyPlanAdjustment.user_id.in_(person_ids), DailyPlanAdjustment.day_date == day,
    ))).scalars().all()} if person_ids else {}

    people = []
    department_metric_rows: list[dict] = []
    for person_id in sorted(person_ids, key=lambda value: ((users.get(value).full_name if users.get(value) else ""), str(value))):
        candidate_ids = candidate_task_ids_for_person(
            person_id, baseline_by_user=baseline_by_user,
            current_assignees=current_assignees, tasks=tasks,
            events_by_task=events_by_task, day=day,
        )
        rows = []
        metric_rows = []
        for task_id in sorted(candidate_ids, key=str):
            task = tasks.get(task_id)
            original = baseline_by_user.get(person_id, {}).get(task_id)
            task_events = events_by_task.get(task_id, [])
            assignee_events = [event for event in task_events if event.action == "task.assignee_changed"]
            was_assigned_in = any(str(person_id) not in (event.before or {}).get("assignee_ids", []) and str(person_id) in (event.after or {}).get("assignee_ids", []) for event in assignee_events)
            was_assigned_out = bool(original) and person_id not in current_assignees.get(task_id, set())
            due_events = [event for event in task_events if event.action == "task.due_date_changed"]
            latest_due_adjustment = next(
                (adjustments[(person_id, event.id)] for event in reversed(due_events) if (person_id, event.id) in adjustments),
                None,
            )
            adjustment_status = latest_due_adjustment.status if latest_due_adjustment else None
            approved = adjustment_status == "APPROVED"
            reopened = any(event.action == "task.reopened" for event in task_events)
            removed = (
                any(event.action == "task.removed_from_day" for event in task_events)
                or task is None
                or bool(task and not task.is_active)
            )
            progress_delta = float(progress.get(task_id).completed_delta if progress.get(task_id) else 0)
            percentage_delta = sum(max(0, float((event.after or {}).get("value") or 0) - float((event.before or {}).get("value") or 0)) for event in task_events if event.action == "task.progress_changed")
            original_due = None
            if original and original.get("planned_due_date"):
                try: original_due = date.fromisoformat(str(original["planned_due_date"])[:10])
                except ValueError: pass
            if original_due is None and original: original_due = day
            completed_day = local_day(task.completed_at) if task else None
            if progress.get(task_id) and str(progress[task_id].daily_status or "").upper() == "DONE":
                completed_day = day
            for event in task_events:
                if event.action == "task.status_changed" and str((event.after or {}).get("value")).upper() == "DONE":
                    completed_day = local_day(event.created_at)
            current_due = local_day(task.due_date) if task else None
            postponed_today = any(
                event.action == "task.due_date_changed"
                and semantic_local_day((event.before or {}).get("value")) == day
                and semantic_local_day((event.after or {}).get("value"))
                and semantic_local_day((event.after or {}).get("value")) > day
                for event in due_events
            )
            deadline_was_today = bool(original_due == day or (original is None and current_due == day)) or any(
                semantic_local_day((event.before or {}).get("value")) == day for event in due_events
            )
            deadline_is_overdue = bool(current_due and current_due < day)
            completed_today = completed_day == day
            requirement = requires_daily_explanation(
                status=task.status if task else "TODO", selected_day=day,
                deadline=current_due, deadline_was_today=deadline_was_today,
                postponed_today=postponed_today,
            )
            classification = classify_daily_task(DailyClassificationInput(
                day=day, in_baseline=bool(original), original_due_date=original_due,
                current_due_date=current_due, created_date=local_day(task.created_at) if task else None,
                completed_date=completed_day, status=task.status if task else "TODO",
                progress_delta=max(progress_delta, percentage_delta),
                postponed=postponed_today or bool(original and current_due and current_due > day),
                postponement_approved=approved, reopened=reopened,
                blocked=bool(task and task.is_bllok and (task.status or "").upper() != "DONE"),
                removed=removed, reassigned_out=was_assigned_out, reassigned_in=was_assigned_in,
            ))
            state = states.get((person_id, task_id))
            issues = []
            if classification in {"NO_PROGRESS", "POSTPONED_UNAPPROVED", "BLOCKED"} and not (state and state.reason_code): issues.append("MISSING_REASON")
            if state and state.reason_code == "OTHER" and not (state.comment or "").strip(): issues.append("MISSING_REQUIRED_COMMENT")
            reason_missing = requirement.reason_required and not (state and state.reason_code)
            comment_missing = requirement.comment_required and not (state and (state.comment or "").strip())
            if reason_missing and "MISSING_REASON" not in issues: issues.append("MISSING_REASON")
            if comment_missing and "MISSING_REQUIRED_COMMENT" not in issues: issues.append("MISSING_REQUIRED_COMMENT")
            action_required = bool(issues) or (
                classification == "POSTPONED_UNAPPROVED"
            ) or (
                deadline_is_overdue and not completed_today
            ) or (
                deadline_was_today and not completed_today and not postponed_today
            )
            row = {
                "task_id": str(task_id), "match_key": (original or {}).get("match_key") or f"id:{task_id}",
                "title": task.title if task else (original or {}).get("title", "Deleted task"),
                "project_id": str(task.project_id) if task and task.project_id else (original or {}).get("project_id"),
                "project_title": projects.get(task.project_id).title if task and task.project_id in projects else (original or {}).get("project_title"),
                "source_type": (original or {}).get("source_type") or ("system" if task and task.system_template_origin_id else "project" if task and task.project_id else "fast"),
                "original_daily_plan": (original or {}).get("original_daily_plan"),
                "current_due_date": current_due.isoformat() if current_due else None,
                "current_status": task.status if task else "DELETED",
                "classification": classification, "in_original_plan": bool(original),
                "progress_today": percentage_delta, "completed_delta": progress_delta,
                "reason_code": state.reason_code if state else None, "comment": state.comment if state else None,
                "last_change": task_events[-1].created_at.isoformat() if task_events else None,
                "postponement_count": sum(
                    1 for event in due_events
                    if semantic_local_day((event.after or {}).get("value"))
                    and semantic_local_day((event.before or {}).get("value"))
                    and semantic_local_day((event.after or {}).get("value")) > semantic_local_day((event.before or {}).get("value"))
                ),
                "adjustment_status": adjustment_status,
                "requires_explanation": requirement.requires_explanation,
                "reason_required": requirement.reason_required,
                "comment_required": requirement.comment_required,
                "reason_missing": reason_missing,
                "comment_missing": comment_missing,
                "deadline_was_today": deadline_was_today,
                "deadline_is_overdue": deadline_is_overdue,
                "postponed_today": postponed_today,
                "deadline_completed": bool(deadline_was_today and completed_today),
                "deadline_critical": bool((original or {}).get("is_deadline_important") or (task and task.is_deadline_important)),
                "action_required": action_required,
                "issues": issues,
                "timeline": timeline_from_events(day=day, baseline_task=original, events=task_events),
            }
            for timeline_item in row["timeline"]:
                actor_raw = timeline_item.get("actor_user_id")
                if actor_raw:
                    actor = users.get(uuid.UUID(actor_raw))
                    timeline_item["actor_name"] = actor.full_name if actor else None
            metric_rows.append(row)
            if not exceptions_only or classification in EXCEPTION_CLASSIFICATIONS or issues:
                rows.append(row)
        metrics = calculate_daily_metrics(metric_rows)
        department_metric_rows.extend(metric_rows)
        user = users.get(person_id)
        people.append({
            "user_id": str(person_id), "user_name": user.full_name if user else next((p.get("user_name") for p in baseline_people if p.get("user_id") == str(person_id)), str(person_id)),
            "department_id": str(department_id), "tasks": rows, "metrics": metrics,
        })

    department_metrics = calculate_daily_metrics(department_metric_rows)
    latest_close = (await db.execute(select(RealizationDailyCloseEvent, RealizationPeriod).join(
        RealizationPeriod, RealizationPeriod.id == RealizationDailyCloseEvent.period_id
    ).where(RealizationPeriod.department_id == department_id, RealizationPeriod.start_date == day)
      .order_by(RealizationDailyCloseEvent.created_at.desc(), RealizationDailyCloseEvent.id.desc()))).all()
    close_by_user = {}
    for close, _ in latest_close:
        close_by_user.setdefault(str(close.user_id), close)
    for person in people:
        close = close_by_user.get(person["user_id"])
        latest_change = max((datetime.fromisoformat(row["last_change"]) for row in person["tasks"] if row.get("last_change")), default=None)
        person["close_state"] = "REOPENED" if close and close.action == "REOPEN" else "STALE" if close and latest_change and latest_change > close.created_at else "CLOSED" if close else "OPEN"
    return {
        "day": day.isoformat(), "department_id": str(department_id),
        "timezone": settings.REALIZATION_TIMEZONE,
        "baseline_id": str(baseline.id) if baseline else None,
        "baseline_captured_at": baseline.captured_at.isoformat() if baseline else None,
        "baseline_available": baseline is not None, "historical_estimate": False,
        "live": day == datetime.now(ZoneInfo(settings.REALIZATION_TIMEZONE)).date(),
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "metrics": department_metrics, "people": people,
    }
