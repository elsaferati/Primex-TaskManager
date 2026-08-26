from __future__ import annotations

import json
import uuid
from datetime import date
from typing import Any

import httpx
from sqlalchemy import Date as SQLDate, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.department import Department
from app.models.enums import UserRole
from app.models.realization import RealizationPeriod, RealizationPersonResult
from app.models.task import Task
from app.models.system_task_template import SystemTaskTemplate
from app.models.task_assignee import TaskAssignee
from app.models.task_daily_rlz_state import TaskDailyRlzState
from app.models.user import User
from app.services.daily_rlz_compliance import (
    REASON_LABELS,
    build_daily_rlz_compliance,
    next_working_day,
)


REPORT_VARIANTS = {"PRECHECK", "FINAL", "CORRECTION"}


def _local_day(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not hasattr(value, "hour"):
        return value
    try:
        return value.date()
    except AttributeError:
        try:
            return date.fromisoformat(str(value)[:10])
        except ValueError:
            return None


def _identity(task: dict[str, Any]) -> str:
    return str(task.get("task_id") or task.get("match_key") or "")


def _is_completed_today(task: dict[str, Any], source: Task | None, day: date) -> bool:
    if source is not None and _local_day(source.completed_at) == day:
        return True
    if _local_day(task.get("completion_day") or task.get("completed_at")) == day:
        return True
    return any(
        _local_day(item.get("day")) == day
        and str(item.get("daily_status") or "").upper() == "DONE"
        for item in task.get("daily_progress") or []
    )


def _task_row(
    task: dict[str, Any],
    *,
    source: Task | None,
    state: TaskDailyRlzState | None,
    compliance: dict[str, Any] | None,
    day: date,
) -> dict[str, Any]:
    classification = str(task.get("classification") or "")
    status = str(source.status if source is not None else task.get("status") or "TODO").upper()
    completed_today = _is_completed_today(task, source, day)
    completed = completed_today or (
        source is None and classification in {"completed", "completed_on_time", "completed_late"}
    )
    effective_classification = (
        "completed" if completed else "in_progress" if status == "IN_PROGRESS" else "no_progress"
    ) if source is not None else (
        classification or ("completed" if completed else "in_progress" if status == "IN_PROGRESS" else "no_progress")
    )
    planned_today = task.get("attribution") in {"planned_today", "system_schedule"}
    extra = task.get("attribution") == "added_after_weekly_plan"
    due_day = _local_day(source.due_date if source else task.get("effective_deadline"))
    original_due_day = _local_day(task.get("planned_deadline")) if task.get("planned_deadline") else _local_day(source.original_due_date if source else None)
    tomorrow = next_working_day(day)
    unfinished = not completed and status in {"TODO", "IN_PROGRESS"}
    carryover = unfinished and due_day == tomorrow
    postponed = bool((compliance or {}).get("postponed_today")) if compliance is not None else bool(
        unfinished and due_day and original_due_day and due_day > original_due_day and original_due_day <= day
    )
    comment = (
        state.comment
        if state is not None and state.comment is not None
        else None
    )
    issues = list((compliance or {}).get("issues") or [])
    flags = [
        label
        for enabled, label in (
            (planned_today, "planned_today"),
            (completed_today, "completed_today"),
            (extra, "extra"),
            (carryover, "carryover_next_day"),
            (postponed, "postponed"),
        )
        if enabled
    ]
    return {
        "task_id": _identity(task),
        "title": task.get("title") or (source.title if source else ""),
        "source_type": task.get("source_type") or (
            "system" if source and source.system_template_origin_id else "project" if source and source.project_id else "fast"
        ),
        "status": "DONE" if completed else status,
        "classification": effective_classification,
        "planned_today": planned_today,
        "completed_today": completed_today,
        "extra": extra,
        "carryover_next_day": carryover,
        "postponed": postponed,
        "requires_explanation": bool((compliance or {}).get("requires_explanation")),
        "compliance_deadline_was_today": bool((compliance or {}).get("deadline_was_today")),
        "report_day": day.isoformat(),
        "planned_due_date": original_due_day.isoformat() if original_due_day else None,
        "due_date": due_day.isoformat() if due_day else None,
        "reason_code": state.reason_code if state else None,
        "reason_label": (compliance or {}).get("reason_label") or (
            REASON_LABELS.get(state.reason_code) if state and state.reason_code else None
        ),
        "comment": comment,
        "one_h_report_slot": (compliance or {}).get("one_h_report_slot") or (source.one_h_report_slot if source else None),
        "issues": issues,
        "flags": flags,
    }


def _summary(people: list[dict[str, Any]]) -> dict[str, int]:
    tasks = [task for person in people for task in person["tasks"]]
    planned = sum(task["planned_today"] for task in tasks)
    planned_done = sum(task["planned_today"] and task["completed_today"] for task in tasks)
    deadline_today = sum(bool(task.get("compliance_deadline_was_today") or (task.get("planned_due_date") == task.get("report_day"))) for task in tasks)
    return {
        "departments_checked": len({person["department_id"] for person in people}),
        "employees_checked": len(people),
        "employees_not_saved": sum(person["rlz_close_state"]["status"] in {"NOT_SAVED", "CLOSED_EDIT_WINDOW"} for person in people),
        "employees_stale": sum(person["rlz_close_state"]["status"] == "STALE" for person in people),
        "employees_approval_pending": sum(person["manager_approval"]["status"] in {"PENDING", "REVOKED"} for person in people),
        "employees_approval_stale": sum(person["manager_approval"]["status"] == "STALE" for person in people),
        "planned_today": sum(task["planned_today"] for task in tasks),
        "completed_today": sum(task["completed_today"] for task in tasks),
        "unfinished": sum(task["status"] in {"TODO", "IN_PROGRESS"} for task in tasks),
        "in_progress": sum(task["status"] == "IN_PROGRESS" for task in tasks),
        "extras": sum(task["extra"] for task in tasks),
        "carryover_next_day": sum(task["carryover_next_day"] for task in tasks),
        "postponed": sum(task["postponed"] for task in tasks),
        "planned_completed_today_count": planned_done,
        "plan_realization_percentage": round(planned_done / planned * 100, 1) if planned else None,
        "deadlines_today_count": deadline_today,
        "tasks_missing_reason": sum(any(issue.get("code") == "REASON_MISSING" for issue in task["issues"]) for task in tasks),
        "tasks_missing_comment": sum(any(issue.get("code") == "COMMENT_MISSING" for issue in task["issues"]) for task in tasks),
        "tasks_deadline_not_moved": sum(any(issue.get("code") == "DUE_DATE_NOT_MOVED" for issue in task["issues"]) for task in tasks),
        "tasks_missing_slot": sum(any(issue.get("code") == "ONE_H_SLOT_MISSING" for issue in task["issues"]) for task in tasks),
    }


async def build_daily_realization_report(
    db: AsyncSession,
    *,
    day: date,
    variant: str = "FINAL",
) -> dict[str, Any]:
    variant = variant.upper()
    if variant not in REPORT_VARIANTS:
        raise ValueError(f"Unsupported Daily RLZ report variant: {variant}")

    users = (await db.execute(
        select(User).where(
            User.is_active.is_(True),
            User.department_id.is_not(None),
            User.role == UserRole.STAFF,
        ).order_by(User.department_id, User.full_name, User.email)
    )).scalars().all()
    department_ids = {user.department_id for user in users if user.department_id}
    department_names = {
        row.id: row.name
        for row in (await db.execute(select(Department).where(Department.id.in_(department_ids)))).scalars().all()
    } if department_ids else {}

    daily_rows = (await db.execute(
        select(RealizationPersonResult, RealizationPeriod)
        .join(RealizationPeriod, RealizationPeriod.id == RealizationPersonResult.period_id)
        .where(
            RealizationPeriod.period_type == "DAILY",
            RealizationPeriod.start_date == day,
            RealizationPersonResult.user_id.in_([user.id for user in users]),
        )
    )).all() if users else []
    result_by_user = {result.user_id: (result, period) for result, period in daily_rows}

    raw_tasks_by_user: dict[uuid.UUID, list[dict[str, Any]]] = {}
    task_ids: set[uuid.UUID] = set()
    for user in users:
        result_pair = result_by_user.get(user.id)
        facts = result_pair[0].facts_json or {} if result_pair else {}
        merged: dict[str, dict[str, Any]] = {}
        for task in [*(facts.get("tasks") or []), *(facts.get("weekly_completed_tasks") or [])]:
            key = _identity(task)
            if not key:
                continue
            if task in (facts.get("weekly_completed_tasks") or []) and _local_day(task.get("completion_day")) != day:
                continue
            merged[key] = {**merged.get(key, {}), **dict(task)}
            try:
                task_ids.add(uuid.UUID(str(task.get("task_id"))))
            except (TypeError, ValueError):
                pass
        raw_tasks_by_user[user.id] = list(merged.values())

    # Capture tasks added or completed after the official 16:20 snapshot. These
    # rows make the 16:40 FINAL and 17:05 CORRECTION comparisons complete while
    # keeping the saved Weekly Planner snapshot as the deterministic baseline.
    user_ids = [user.id for user in users]
    current_tasks = (await db.execute(
        select(Task)
        .outerjoin(TaskAssignee, TaskAssignee.task_id == Task.id)
        .outerjoin(SystemTaskTemplate, Task.system_template_origin_id == SystemTaskTemplate.id)
        .where(
            Task.is_active.is_(True),
            or_(Task.assigned_to.in_(user_ids), TaskAssignee.user_id.in_(user_ids)),
            or_(
                Task.system_template_origin_id.is_(None),
                SystemTaskTemplate.show_in_weekly_planner.is_(True),
            ),
            or_(
                cast(func.timezone(settings.REALIZATION_TIMEZONE, Task.created_at), SQLDate) == day,
                cast(func.timezone(settings.REALIZATION_TIMEZONE, Task.completed_at), SQLDate) == day,
            ),
        )
        .distinct()
    )).scalars().all() if users else []
    current_ids = [task.id for task in current_tasks]
    current_assignees: dict[uuid.UUID, set[uuid.UUID]] = {}
    if current_ids:
        for task_id, assignee_id in (await db.execute(select(
            TaskAssignee.task_id, TaskAssignee.user_id
        ).where(TaskAssignee.task_id.in_(current_ids)))).all():
            current_assignees.setdefault(task_id, set()).add(assignee_id)
    for task in current_tasks:
        assignees = current_assignees.get(task.id) or ({task.assigned_to} if task.assigned_to else set())
        for user_id in assignees.intersection(user_ids):
            if str(task.id) in {_identity(item) for item in raw_tasks_by_user[user_id]}:
                continue
            raw_tasks_by_user[user_id].append({
                "task_id": str(task.id),
                "title": task.title,
                "status": str(task.status),
                "source_type": "system" if task.system_template_origin_id else "project" if task.project_id else "fast",
                "attribution": "added_after_weekly_plan",
            })
            task_ids.add(task.id)

    task_map = {
        task.id: task
        for task in (await db.execute(select(Task).where(Task.id.in_(task_ids)))).scalars().all()
    } if task_ids else {}
    state_rows = (await db.execute(select(TaskDailyRlzState).where(
        TaskDailyRlzState.day_date == day,
        TaskDailyRlzState.user_id.in_([user.id for user in users]),
    ))).scalars().all() if users else []
    state_map = {(row.user_id, row.task_id): row for row in state_rows}

    people: list[dict[str, Any]] = []
    for user in users:
        compliance = await build_daily_rlz_compliance(db, user_id=user.id, day=day)
        evidence_by_id = {str(item["task_id"]): item for item in compliance.get("tasks") or []}
        raw_tasks = list(raw_tasks_by_user.get(user.id, []))
        raw_ids = {_identity(item) for item in raw_tasks}
        for evidence in compliance.get("tasks") or []:
            if str(evidence["task_id"]) not in raw_ids:
                raw_tasks.append({
                    "task_id": evidence["task_id"],
                    "title": evidence["title"],
                    "status": evidence["status"],
                    "effective_deadline": evidence.get("due_date"),
                    "planned_deadline": evidence.get("planned_due_date"),
                    "user_comment": evidence.get("comment"),
                    "source_type": evidence.get("source_type") or "project",
                    "attribution": "operational_only",
                })
        tasks: list[dict[str, Any]] = []
        for raw in raw_tasks:
            try:
                task_uuid = uuid.UUID(str(raw.get("task_id")))
            except (TypeError, ValueError):
                task_uuid = None
            tasks.append(_task_row(
                raw,
                source=task_map.get(task_uuid) if task_uuid else None,
                state=state_map.get((user.id, task_uuid)) if task_uuid else None,
                compliance=evidence_by_id.get(str(raw.get("task_id"))),
                day=day,
            ))
        tasks.sort(key=lambda item: (
            0 if item["planned_today"] else 1,
            0 if item["status"] != "DONE" else 1,
            str(item["title"]).lower(),
        ))
        result_pair = result_by_user.get(user.id)
        facts = result_pair[0].facts_json or {} if result_pair else {}
        people.append({
            "user_id": str(user.id),
            "employee": user.full_name or user.username or user.email,
            "department_id": str(user.department_id),
            "department": department_names.get(user.department_id, "—"),
            "snapshot_available": result_pair is not None,
            "rlz_close_state": compliance["rlz_close_state"],
            "manager_approval": compliance["manager_approval"],
            "daily_progress_percent": facts.get("daily_progress_percent", 0),
            "weekly_progress_percent": facts.get("weekly_progress_percent", 0),
            "tasks": tasks,
            "blockers": compliance.get("blockers") or [],
            "narrative": None,
            "risks": [],
        })

    report = {
        "content_version": 2,
        "variant": variant,
        "day": day.isoformat(),
        "summary": _summary(people),
        "people": people,
        "all_good": not any(
            person["blockers"]
            or person["rlz_close_state"]["status"] != "SAVED"
            or person["manager_approval"]["status"] != "APPROVED"
            for person in people
        ),
        "narrative": None,
        "ai": {"status": "DETERMINISTIC", "model": None},
    }
    return report


NARRATIVE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "people": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "user_id": {"type": "string"},
                    "summary": {"type": "string"},
                    "risks": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["user_id", "summary", "risks"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "people"],
    "additionalProperties": False,
}


def _output_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    for output in payload.get("output") or []:
        for content in output.get("content") or []:
            if content.get("type") == "output_text" and content.get("text"):
                return str(content["text"])
    raise ValueError("OpenAI response did not contain output_text")


async def add_optional_ai_narrative(report: dict[str, Any]) -> dict[str, Any]:
    if (
        report.get("variant") != "FINAL"
        or not settings.REALIZATION_DAILY_REPORT_AI_ENABLED
        or not settings.OPENAI_API_KEY
    ):
        return report
    safe_people = []
    for person in report.get("people") or []:
        safe_people.append({
            "user_id": person["user_id"],
            "daily_progress_percent": person["daily_progress_percent"],
            "weekly_progress_percent": person["weekly_progress_percent"],
            "rlz_state": person["rlz_close_state"]["status"],
            "manager_approval": person["manager_approval"]["status"],
            "tasks": [
                {
                    "task_id": task["task_id"],
                    "title": task["title"],
                    "status": task["status"],
                    "reason": task["reason_label"],
                    "comment": task["comment"],
                    "flags": task["flags"],
                }
                for task in person["tasks"]
            ],
        })
    request = {
        "model": settings.REALIZATION_DAILY_REPORT_AI_MODEL,
        "store": False,
        "reasoning": {"effort": "none"},
        "input": [
            {"role": "system", "content": (
                "Summarize the supplied deterministic PrimeFlow daily realization facts in concise Albanian. "
                "Never invent facts, scores, reasons, or task states. Names are intentionally absent. "
                "Mention completed work, unfinished work, extras, carryover and postponements only when present."
            )},
            {"role": "user", "content": json.dumps({"summary": report["summary"], "people": safe_people}, ensure_ascii=False)},
        ],
        "text": {"format": {"type": "json_schema", "name": "daily_realization_narrative", "strict": True, "schema": NARRATIVE_SCHEMA}},
    }
    try:
        async with httpx.AsyncClient(timeout=settings.REALIZATION_DAILY_REPORT_AI_TIMEOUT_SECONDS) as client:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}", "Content-Type": "application/json"},
                json=request,
            )
        response.raise_for_status()
        narrative = json.loads(_output_text(response.json()))
        by_user = {item["user_id"]: item for item in narrative["people"]}
        report["narrative"] = narrative["summary"]
        for person in report["people"]:
            item = by_user.get(person["user_id"])
            if item:
                person["narrative"] = item["summary"]
                person["risks"] = item["risks"]
        report["ai"] = {
            "status": "AI_GENERATED",
            "model": settings.REALIZATION_DAILY_REPORT_AI_MODEL,
            "prompt_version": 1,
            "store": False,
        }
    except (httpx.HTTPError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        report["ai"] = {
            "status": "DETERMINISTIC_FALLBACK",
            "model": settings.REALIZATION_DAILY_REPORT_AI_MODEL,
            "prompt_version": 1,
            "store": False,
            "error": type(exc).__name__,
        }
    return report


def report_delta(final_report: dict[str, Any], current_report: dict[str, Any]) -> dict[str, Any]:
    before = {
        (person["user_id"], task["task_id"]): task
        for person in final_report.get("people") or []
        for task in person.get("tasks") or []
    }
    before_people = {person["user_id"]: person for person in final_report.get("people") or []}
    changed_people: list[dict[str, Any]] = []
    for person in current_report.get("people") or []:
        changed = []
        current_keys: set[tuple[str, str]] = set()
        for task in person.get("tasks") or []:
            current_keys.add((person["user_id"], task["task_id"]))
            previous = before.get((person["user_id"], task["task_id"]))
            material = {
                key: task.get(key)
                for key in ("status", "due_date", "reason_code", "comment", "one_h_report_slot", "flags")
            }
            old_material = {
                key: previous.get(key)
                for key in material
            } if previous else None
            if previous is None or material != old_material:
                changed.append({**task, "previous": old_material, "change_type": "ADDED" if previous is None else "UPDATED"})
        for (user_id, task_id), previous in before.items():
            if user_id == person["user_id"] and (user_id, task_id) not in current_keys:
                changed.append({**previous, "previous": previous, "change_type": "REMOVED"})
        old_person = before_people.get(person["user_id"]) or {}
        state_changed = any(
            person.get(key) != old_person.get(key)
            for key in ("daily_progress_percent", "weekly_progress_percent", "rlz_close_state", "manager_approval")
        )
        if changed or state_changed:
            changed_people.append({**person, "tasks": changed})
    delta = {**current_report, "variant": "CORRECTION", "people": changed_people}
    delta["summary"] = _summary(changed_people)
    delta["all_good"] = not changed_people
    delta["narrative"] = "Ndryshimet pas raportit të orës 16:40."
    return delta
