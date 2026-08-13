from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.realization import RealizationDailyCloseEvent, RealizationPeriod
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.task_daily_rlz_state import TaskDailyRlzState
from app.models.task_one_h_report_slot import TaskOneHReportSlot
from app.models.task_user_comment import TaskUserComment
from app.models.user import User
from app.models.department import Department
from app.models.enums import UserRole
from app.services.one_h_slots import effective_slot_date

TIMEZONE_NAME = "Europe/Tirane"
EDIT_CUTOFF = time(17, 0)
UNFINISHED = {"TODO", "IN_PROGRESS"}
REASON_DEFINITIONS = (
    ("TOOK_LONGER", "Mori më shumë kohë"),
    ("OTHER_URGENCY", "Urgjencë tjetër"),
    ("WAITING_CLIENT", "Në pritje të klientit"),
    ("PRIORITY_CHANGE", "Ndryshim prioriteti"),
    ("TECHNICAL_PROBLEM", "Problem teknik"),
    ("MISSING_INFORMATION", "Mungesë informacioni"),
    ("REQUEST_CHANGE", "Ndryshim kërkese"),
    ("NEW_REQUESTS", "Kerkesa te reja"),
    ("ABSENCE", "Mungesë"),
    ("OTHER", "Tjetër"),
)
REASON_LABELS = dict(REASON_DEFINITIONS)


def tirana_now() -> datetime:
    return datetime.now(ZoneInfo(TIMEZONE_NAME))


def next_working_day(day: date) -> date:
    result = day + timedelta(days=1)
    while result.weekday() >= 5:
        result += timedelta(days=1)
    return result


def editable_until(day: date) -> datetime:
    return datetime.combine(day, EDIT_CUTOFF, tzinfo=ZoneInfo(TIMEZONE_NAME))


def is_editable_day(day: date, now: datetime | None = None) -> bool:
    current = now or tirana_now()
    return day.weekday() < 5 and day == current.date() and current < editable_until(day)


def task_issue_codes(*, status: str, due_date: date | None, is_1h_report: bool,
                     one_h_report_slot: str | None, reason_code: str | None, day: date) -> list[str]:
    if status not in UNFINISHED:
        return []
    issues: list[str] = []
    if not reason_code:
        issues.append("REASON_MISSING")
    if due_date is None or due_date <= day:
        issues.append("DUE_DATE_NOT_MOVED")
    if is_1h_report and not one_h_report_slot:
        issues.append("ONE_H_SLOT_MISSING")
    return issues


ISSUE_MESSAGES = {
    "REASON_MISSING": "Mungon arsyeja",
    "DUE_DATE_NOT_MOVED": "Deadline-i duhet shtyrë për ditën tjetër të punës ose më vonë",
    "ONE_H_SLOT_MISSING": "Mungon 1H sloti",
}


async def relevant_tasks(db: AsyncSession, *, user_id: uuid.UUID, day: date) -> list[Task]:
    # Mirrors the regular-task membership used by Daily Report: assigned active tasks
    # with a due date that are current/overdue for the selected workday.
    rows = (await db.execute(
        select(Task).outerjoin(TaskAssignee, TaskAssignee.task_id == Task.id).where(
            Task.is_active.is_(True), Task.system_template_origin_id.is_(None), Task.due_date.is_not(None),
            or_(Task.assigned_to == user_id, TaskAssignee.user_id == user_id),
            func.date(func.coalesce(Task.start_date, Task.due_date)) <= day,
        ).distinct().order_by(Task.due_date, Task.created_at)
    )).scalars().all()
    return list(rows)


async def build_daily_rlz_compliance(db: AsyncSession, *, user_id: uuid.UUID, day: date,
                                     now: datetime | None = None) -> dict:
    tasks = await relevant_tasks(db, user_id=user_id, day=day)
    task_ids = [task.id for task in tasks]
    states = {}
    slots = {}
    comments = {}
    if task_ids:
        states = {row.task_id: row for row in (await db.execute(select(TaskDailyRlzState).where(
            TaskDailyRlzState.user_id == user_id, TaskDailyRlzState.day_date == day,
            TaskDailyRlzState.task_id.in_(task_ids),
        ))).scalars().all()}
        comments = {row.task_id: row for row in (await db.execute(select(TaskUserComment).where(
            TaskUserComment.user_id == user_id, TaskUserComment.task_id.in_(task_ids),
        ))).scalars().all()}
        slot_rows = (await db.execute(select(
            TaskOneHReportSlot.task_id, TaskOneHReportSlot.one_h_report_slot, TaskOneHReportSlot.updated_at
        ).where(
            TaskOneHReportSlot.task_id.in_(task_ids),
            TaskOneHReportSlot.report_date == effective_slot_date(day, now),
        ))).all()
        slots = {task_id: slot for task_id, slot, _ in slot_rows}
        slot_changed = {task_id: updated_at for task_id, _, updated_at in slot_rows}
    else:
        slot_changed = {}
    evidence = []
    blockers = []
    latest_change: datetime | None = None
    minimum_due = next_working_day(day)
    for task in tasks:
        state = states.get(task.id)
        task_comment = comments.get(task.id)
        status = "DONE" if task.completed_at else str(getattr(task.status, "value", task.status))
        due = task.due_date.date() if task.due_date else None
        slot = slots.get(task.id) or task.one_h_report_slot
        reason = state.reason_code if state else None
        issue_codes = task_issue_codes(status=status, due_date=due, is_1h_report=bool(task.is_1h_report),
                                       one_h_report_slot=slot, reason_code=reason, day=day)
        item = {
            "task_id": str(task.id), "title": task.title, "status": status,
            "due_date": due.isoformat() if due else None, "one_h_report_slot": slot,
            "reason_code": reason, "reason_label": REASON_LABELS.get(reason),
            "comment": state.comment if state and state.comment is not None else task_comment.comment if task_comment else None,
        }
        evidence.append(item)
        if issue_codes:
            blockers.append({
                "task_id": str(task.id), "title": task.title, "status": status,
                "due_date": item["due_date"], "minimum_due_date": minimum_due.isoformat(),
                "one_h_report_slot": slot, "reason_code": reason,
                "reason_label": REASON_LABELS.get(reason), "comment": item["comment"],
                "issues": [{"code": code, "message": ISSUE_MESSAGES[code]} for code in issue_codes],
            })
        for changed in (task.updated_at, state.updated_at if state else None,
                        task_comment.updated_at if task_comment else None, slot_changed.get(task.id)):
            if changed and (latest_change is None or changed > latest_change):
                latest_change = changed
    latest_close = (await db.execute(
        select(RealizationDailyCloseEvent).join(RealizationPeriod, RealizationPeriod.id == RealizationDailyCloseEvent.period_id).where(
            RealizationDailyCloseEvent.user_id == user_id, RealizationPeriod.period_type == "DAILY",
            RealizationPeriod.start_date == day,
        ).order_by(RealizationDailyCloseEvent.created_at.desc(), RealizationDailyCloseEvent.id.desc()).limit(1)
    )).scalar_one_or_none()
    saved = bool(latest_close and latest_close.action in {"CLOSE", "CORRECT"})
    stale = bool(saved and latest_change and latest_close and latest_change > latest_close.created_at)
    close_status = "STALE" if stale else "SAVED" if saved else "CLOSED_EDIT_WINDOW" if not is_editable_day(day, now) else "NOT_SAVED"
    return {
        "day": day.isoformat(), "user_id": str(user_id), "tasks": evidence, "blockers": blockers,
        "compliant": not blockers, "rlz_close_state": {
            "status": close_status, "saved": saved, "stale": stale,
            "saved_at": latest_close.created_at.isoformat() if saved and latest_close else None,
            "is_editable": is_editable_day(day, now),
            "editable_until": editable_until(day).isoformat(),
        },
    }


async def build_daily_rlz_control(db: AsyncSession, *, day: date, department_id: uuid.UUID | None = None,
                                  user_id: uuid.UUID | None = None) -> dict:
    stmt = select(User).where(User.is_active.is_(True), User.department_id.is_not(None), User.role == UserRole.STAFF)
    if department_id:
        stmt = stmt.where(User.department_id == department_id)
    if user_id:
        stmt = stmt.where(User.id == user_id)
    users = (await db.execute(stmt.order_by(User.department_id, User.full_name, User.email))).scalars().all()
    department_ids = {subject.department_id for subject in users if subject.department_id}
    departments = {row.id: row.name for row in (await db.execute(
        select(Department).where(Department.id.in_(department_ids))
    )).scalars().all()} if department_ids else {}
    people, totals = [], {"employees_checked": 0, "employees_not_saved": 0, "employees_stale": 0,
                         "tasks_missing_reason": 0, "tasks_deadline_not_moved": 0, "tasks_missing_slot": 0}
    for subject in users:
        report = await build_daily_rlz_compliance(db, user_id=subject.id, day=day)
        totals["employees_checked"] += 1
        state = report["rlz_close_state"]["status"]
        if state in {"NOT_SAVED", "CLOSED_EDIT_WINDOW"}: totals["employees_not_saved"] += 1
        if state == "STALE": totals["employees_stale"] += 1
        for blocker in report["blockers"]:
            codes = {issue["code"] for issue in blocker["issues"]}
            totals["tasks_missing_reason"] += int("REASON_MISSING" in codes)
            totals["tasks_deadline_not_moved"] += int("DUE_DATE_NOT_MOVED" in codes)
            totals["tasks_missing_slot"] += int("ONE_H_SLOT_MISSING" in codes)
        if report["blockers"] or state != "SAVED":
            people.append({"user_id": str(subject.id), "employee": subject.full_name or subject.username or subject.email,
                           "department_id": str(subject.department_id), "department": departments.get(subject.department_id, "—"), **report})
    totals["departments_checked"] = len({person.department_id for person in users})
    return {"day": day.isoformat(), "summary": totals, "people": people, "all_good": not people}
