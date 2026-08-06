from __future__ import annotations

import html
import os
import re
import textwrap
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common_entry import CommonEntry
from app.models.department import Department
from app.models.enums import CommonApprovalStatus, CommonCategory
from app.models.meeting import Meeting
from app.models.meeting_occurrence_status import MeetingOccurrenceStatus
from app.models.system_task_template import SystemTaskTemplate
from app.models.system_task_template_alignment_user import SystemTaskTemplateAlignmentUser
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.services.common_leave import parse_common_view_annual_leave
from app.services.daily_report_logic import business_days_between
from app.services.primeflow_report import GmailService, report_timezone
from app.services.primeflow_report import PrimeFlowClient
from app.services.std_feedback_tickets import std_tickets_report_section
from app.services.system_task_schedule import matches_template_date

REPORT_TYPE = "meetings_report"
SECTION_TITLES = [
    "A JEMI BRENDA MESATARES ME PROJEKTE/",
    "(GA) M3 DET GA MBYLLJA ME HV?",
    "(GA) TIKETAT E STD DHE TONAT? RAPORTOHEN NE M3",
    "DET NE PROCES SISTEMIT - SYSTEM TASKS REPORT - LATE?",
    "DET. PA PROGRES (PINK)?",
    "N- (GA) PV/FESTE?",
    "N- (GA) TAKIMET EXTERNE/ TAKIMET INTERNE/ BZ ME GA/BLLOK?",
    "N- (GA) SHIKOHET COMMON VIEW NESER, VETEM DETYRAT E REJA ME TE KALTER, 08:00 DHE ME DEADLINE?",
    "TAKIMET PA KRY (KONTROLLO PLATFORMEN)?",
    "N- A KA DETYRA 1H PA SLOT?",
    "N- (GA/KA) KUSH KA DET PERSONALISHT?",
]
DISPLAY_SECTION_TITLES = [
    SECTION_TITLES[0],
    SECTION_TITLES[1],
    SECTION_TITLES[2],
    SECTION_TITLES[3],
    SECTION_TITLES[4],
    SECTION_TITLES[8],
    SECTION_TITLES[5],
    SECTION_TITLES[7],
    SECTION_TITLES[6],
    SECTION_TITLES[9],
    SECTION_TITLES[10],
]
MANUAL_SECTION_TITLES = {
    SECTION_TITLES[0],
}
SECTION_TITLE_ALIASES = {
    "(GA/KA) KUSH KA DET PERSONALISHT?": SECTION_TITLES[10],
}
# Same rule for M1/M2/M3: personal rows only when the title marks GA (not KA).
PERSONAL_GA = re.compile(r"[/:]\s*GA\b", re.I)
TECHNICAL_TAG = re.compile(r"\[\[\s*/?\s*(?:added|done)\s*\]\]", re.I)
DUE_SUFFIX = re.compile(r"\s+due\s+\d{1,2}:\d{2}\s*$", re.I)
TITLE_PREFIX = re.compile(r"^[A-Z]{1,4}(?:/[A-Z]{1,4})?\s*:\s*", re.I)
TASK_LINE_STATUS = re.compile(r"^\[([A-Z_]+)\]\s*")


def next_working_day(day: date) -> date:
    candidate = day + timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


def subject_for(day: date) -> str:
    return f"PrimeFlow Mbyllja e dites M3 - {day:%d.%m.%Y}"


def normalize_meetings_report_sections(sections: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    """Keep saved drafts aligned with the current M3 question list without losing edits."""
    existing_sections = sections or []
    by_title: dict[str, dict[str, str]] = {}
    unknown_sections: list[dict[str, str]] = []
    for section in existing_sections:
        title = SECTION_TITLE_ALIASES.get(str(section.get("title") or "").strip(), str(section.get("title") or "").strip())
        if not title:
            continue
        normalized = {"title": title, "body": str(section.get("body") or "")}
        if title in DISPLAY_SECTION_TITLES and title not in by_title:
            by_title[title] = normalized
        else:
            unknown_sections.append(normalized)

    ordered: list[dict[str, str]] = []
    for title in DISPLAY_SECTION_TITLES:
        if title in by_title:
            ordered.append(by_title[title])
        elif title in MANUAL_SECTION_TITLES:
            ordered.append({"title": title, "body": "(Ploteso manualisht)"})

    return ordered + unknown_sections


def _local_date(value: datetime | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo:
            return value.astimezone(report_timezone()).date()
        return value.date()
    return value


def _local_time(value: datetime | None) -> str:
    if value is None:
        return "-"
    local = value.astimezone(report_timezone()) if value.tzinfo else value
    return local.strftime("%H:%M")


def _task_day(task: Task) -> date | None:
    return _local_date(task.due_date or task.start_date or task.created_at)


def _meeting_occurs_on_date(meeting: Meeting, day: date) -> bool:
    recurrence = (meeting.recurrence_type or "").lower()
    if recurrence == "weekly":
        return bool(meeting.recurrence_days_of_week and day.weekday() in meeting.recurrence_days_of_week)
    if recurrence == "monthly":
        return bool(meeting.recurrence_days_of_month and day.day in meeting.recurrence_days_of_month)
    if recurrence == "yearly":
        month = meeting.starts_at.month if meeting.starts_at else None
        day_value = meeting.recurrence_days_of_month[0] if meeting.recurrence_days_of_month else None
        return bool(month and day_value and day.month == month and day.day == day_value)
    return _local_date(meeting.starts_at or meeting.created_at) == day


def _is_open(task: Task) -> bool:
    return not task.completed_at and str(task.status or "").upper() not in {"DONE", "COMPLETED"}


def _late_days(task: Task) -> int:
    due_day = _local_date(task.due_date)
    if due_day is None:
        return 0
    today = datetime.now(report_timezone()).date()
    if today <= due_day:
        return 0
    return business_days_between(due_day, today)


def _late_days_label(days: int) -> str:
    if days <= 0:
        return "-"
    return f"{days} day" if days == 1 else f"{days} days"


def _initials(name: str | None) -> str:
    parts = re.findall(r"[^\W\d_]+", name or "", flags=re.UNICODE)
    return "".join(part[0] for part in parts).upper() or "-"


async def _assignee_names(db: AsyncSession, tasks: list[Task]) -> dict[Any, str]:
    user_ids = {task.assigned_to for task in tasks if task.assigned_to}
    task_ids = [task.id for task in tasks]
    if task_ids:
        assignee_user_ids = (
            await db.execute(select(TaskAssignee.user_id).where(TaskAssignee.task_id.in_(task_ids)))
        ).scalars().all()
        user_ids.update(assignee_user_ids)
    if not user_ids:
        return {}
    users = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
    return {user.id: user.full_name or user.email for user in users}


async def _effective_task_assignee_ids(db: AsyncSession, tasks: list[Task]) -> dict[Any, set[Any]]:
    result: dict[Any, set[Any]] = {task.id: set() for task in tasks}
    for task in tasks:
        if task.assigned_to:
            result.setdefault(task.id, set()).add(task.assigned_to)
    task_ids = [task.id for task in tasks]
    if not task_ids:
        return result
    rows = (
        await db.execute(select(TaskAssignee.task_id, TaskAssignee.user_id).where(TaskAssignee.task_id.in_(task_ids)))
    ).all()
    for task_id, user_id in rows:
        result.setdefault(task_id, set()).add(user_id)
    return result


async def _users_by_initials(db: AsyncSession, initials: str) -> list[User]:
    users = (await db.execute(select(User).where(User.is_active.is_(True)))).scalars().all()
    target = initials.upper()
    return [
        user for user in users
        if _initials(user.full_name) == target
        or (user.username or "").strip().upper() == target
        or (user.email or "").split("@", 1)[0].strip().upper() == target
    ]


def _task_owners(task: Task, names: dict[Any, str], assignee_ids_by_task: dict[Any, set[Any]] | None = None) -> str:
    assignee_ids = assignee_ids_by_task.get(task.id, set()) if assignee_ids_by_task else set()
    if not assignee_ids and task.assigned_to:
        assignee_ids = {task.assigned_to}
    owners = sorted({_initials(names.get(user_id)) for user_id in assignee_ids if _initials(names.get(user_id)) != "-"})
    return " ".join(owners) or _initials(names.get(task.assigned_to))


def _task_line(
    task: Task,
    names: dict[Any, str],
    assignee_ids_by_task: dict[Any, set[Any]] | None = None,
    *,
    include_status: bool = False,
) -> str:
    owner = _task_owners(task, names, assignee_ids_by_task)
    title = _clean_task_title(task.title)
    line = f"- {owner}: {title}"
    if include_status:
        return f"- [{_normalize_report_status(task.status)}] {owner}: {title}"
    return line


def _task_line_with_late_days(task: Task, names: dict[Any, str]) -> str:
    owner = _initials(names.get(task.assigned_to))
    title_lines = _wrap_fixed_width(_clean_task_title(task.title), 48)
    days = _late_days(task)
    late_label = _late_days_label(days)
    lines = [f"- {owner:<4} | {title_lines[0]:<48} | {late_label}"]
    lines.extend(f"  {'':<4} | {line:<48} |" for line in title_lines[1:])
    return "\n".join(lines)


def _wrap_fixed_width(value: str, width: int) -> list[str]:
    cleaned = re.sub(r"\s+", " ", value).strip()
    return textwrap.wrap(cleaned, width=width, break_long_words=False, break_on_hyphens=False) or ["-"]


def _m3_status_table(
    status_label: str,
    tasks: list[Task],
    names: dict[Any, str],
    *,
    include_late_days: bool = False,
    with_status: bool = False,
) -> list[str]:
    if include_late_days:
        border = "+----+-------+------------------------------------------------------------------+--------------+"
        header = f"| {'NR':<2} | {'WHO':<5} | {'TITLE':<64} | {'LATE':<12} |"
    else:
        border = "+----+-------+------------------------------------------------------------------+"
        header = f"| {'NR':<2} | {'WHO':<5} | {'TITLE':<64} |"
    rows = [
        f"{status_label}:",
        border,
        header,
        border,
    ]
    if not tasks:
        if include_late_days:
            rows.append(f"| {'-':<2} | {'-':<5} | {'(Asnje detyre)':<64} | {'-':<12} |")
        else:
            rows.append(f"| {'-':<2} | {'-':<5} | {'(Asnje detyre)':<64} |")
        rows.append(border)
        return rows
    for index, task in enumerate(sorted(tasks, key=lambda item: (_initials(names.get(item.assigned_to)), _clean_task_title(item.title))), start=1):
        owner = _initials(names.get(task.assigned_to))
        display_title = _clean_task_title(task.title)
        title_lines = _wrap_fixed_width(display_title, 64)
        status = _normalize_report_status(task.status) if with_status else None
        padded_titles = _append_status_marker_to_lines(title_lines, status, 64)
        if include_late_days:
            late_label = _late_days_label(_late_days(task))
            rows.append(f"| {index:<2} | {owner:<5} | {padded_titles[0]} | {late_label:<12} |")
        else:
            rows.append(f"| {index:<2} | {owner:<5} | {padded_titles[0]} |")
        for line in padded_titles[1:]:
            if include_late_days:
                rows.append(f"| {'':<2} | {'':<5} | {line} | {'':<12} |")
            else:
                rows.append(f"| {'':<2} | {'':<5} | {line} |")
        rows.append(border)
    return rows


def _task_late_lines(tasks: list[Task], names: dict[Any, str]) -> list[str]:
    if not tasks:
        return ["(Asnje detyre)"]
    ordered = sorted(tasks, key=lambda item: (-_late_days(item), _clean_task_title(item.title)))
    return [_task_line_with_late_days(task, names) for task in ordered]


def _clean_task_title(value: str | None) -> str:
    """Normalize task titles for reports.

    Titles often store post-create edits as ``[[added]]...[[/added]]``. Keep that
    text (it is usually the real description) and only strip the markers.
    """
    cleaned = TECHNICAL_TAG.sub("", value or "")
    candidates = [line.strip() for line in cleaned.splitlines() if line.strip()]
    title_line = next((line for line in candidates if TITLE_PREFIX.search(line)), "")
    if not title_line:
        title_line = next((line for line in candidates if not re.match(r"^\d+\.", line)), "")
    title_line = DUE_SUFFIX.sub("", title_line)
    return re.sub(r"\s+", " ", title_line).strip() or "-"


def _empty_aware(lines: list[str]) -> str:
    return "\n".join(lines) if lines else "(Asnje detyre)"


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


async def build_meetings_report_sections(db: AsyncSession, report_day: date) -> tuple[date, list[dict[str, str]], dict[str, Any]]:
    tomorrow = next_working_day(report_day)
    week_start = _week_start(report_day)
    common_items = await _common_view_items(tomorrow)

    task_stmt = (
        select(Task)
        .where(Task.is_active.is_(True))
        .where(
            or_(
                Task.start_date.is_not(None),
                Task.due_date.is_not(None),
                Task.created_at.is_not(None),
            )
        )
    )
    tasks = (await db.execute(task_stmt)).scalars().all()
    names = await _assignee_names(db, tasks)
    assignee_ids_by_task = await _effective_task_assignee_ids(db, tasks)
    finance_section = await _m3_finance_ga_section(db, tasks, names, report_day)
    std_tickets_section = await std_tickets_report_section(db, report_day)

    system_tasks = [task for task in tasks if task.system_template_origin_id and _is_open(task)]
    system_in_progress = [task for task in system_tasks if str(task.status or "").upper() == "IN_PROGRESS"]
    system_late = _dedupe_system_task_rows([task for task in system_tasks if _late_days(task) > 0])

    today_todo = [
        task for task in tasks
        if not task.system_template_origin_id
        and _task_day(task) == report_day
        and _is_open(task)
        and str(task.status or "").upper() == "TODO"
    ]

    tomorrow_tasks = [task for task in tasks if _task_day(task) == tomorrow and _is_open(task)]
    new_tomorrow = [task for task in tomorrow_tasks if _local_date(task.created_at) and _local_date(task.created_at) >= week_start]
    at_0800 = [task for task in tomorrow_tasks if task.due_date and _local_time(task.due_date) == "08:00"]
    deadline = [task for task in tomorrow_tasks if task.is_deadline_important]
    one_h_no_slot = [task for task in tomorrow_tasks if task.is_1h_report and not task.one_h_report_slot]
    personal_ga = [
        task for task in tasks
        if task.is_personal
        and _is_open(task)
        and _task_day(task) == tomorrow
        and (
            PERSONAL_GA.search(_clean_task_title(task.title))
            or PERSONAL_GA.search(task.title or "")
        )
    ]
    blocked = [task for task in tomorrow_tasks if task.is_bllok]
    bz_tasks = [task for task in tomorrow_tasks if re.search(r"\bBZ\b", task.title or "", re.I)]
    bz_alignment_lines = await _bz_alignment_lines(
        db, tomorrow, tasks, names, assignee_ids_by_task, include_status=True
    )

    meeting_stmt = select(Meeting).where(Meeting.starts_at.is_not(None))
    meetings = (await db.execute(meeting_stmt)).scalars().all()
    today_meetings = [meeting for meeting in meetings if _meeting_occurs_on_date(meeting, report_day)]
    tomorrow_meetings = [meeting for meeting in meetings if _meeting_occurs_on_date(meeting, tomorrow)]
    external_meetings = [m for m in tomorrow_meetings if getattr(m, "meeting_type", None) == "external"]
    internal_meetings = [m for m in tomorrow_meetings if getattr(m, "meeting_type", None) != "external"]
    leave_entries = (
        await db.execute(select(CommonEntry).where(CommonEntry.category == CommonCategory.annual_leave))
    ).scalars().all()
    leave_tomorrow = []
    for entry in leave_entries:
        start_date, end_date, full_day, start_time, end_time, note, is_all_users = parse_common_view_annual_leave(entry)
        if start_date <= tomorrow <= end_date:
            leave_tomorrow.append((entry, full_day, start_time, end_time, note, is_all_users))

    section_1 = [
        *_m3_status_table("IN PROGRESS", system_in_progress, names),
        "",
        *_m3_status_table("LATE", system_late, names, include_late_days=True),
    ]
    section_4 = _tomorrow_common_section(
        common_items=common_items,
        tomorrow=tomorrow,
        fallback_external=_meeting_lines(external_meetings),
        fallback_internal=_meeting_lines(internal_meetings),
        fallback_bz=bz_alignment_lines
        or _task_lines(bz_tasks, names, assignee_ids_by_task, include_status=True),
        fallback_blocked=_task_lines(blocked, names, assignee_ids_by_task, include_status=True),
        with_status=True,
    )
    section_5 = [
        *_m3_status_table("DETYRAT E REJA", new_tomorrow, names),
        "",
        *_m3_status_table("08:00", at_0800, names),
        "",
        *_m3_status_table("ME DEADLINE", deadline, names),
    ]
    section_6 = await _today_meeting_status_section(db, today_meetings, report_day)

    sections = [
        {"title": SECTION_TITLES[0], "body": "(Ploteso manualisht)"},
        {"title": SECTION_TITLES[1], "body": finance_section},
        {"title": SECTION_TITLES[2], "body": std_tickets_section},
        {"title": SECTION_TITLES[3], "body": _normalize_section(section_1)},
        {"title": SECTION_TITLES[4], "body": _normalize_section(_m3_status_table("TODO", today_todo, names))},
        {"title": SECTION_TITLES[8], "body": section_6},
        {"title": SECTION_TITLES[5], "body": _empty_aware(_leave_lines(leave_tomorrow, names))},
        {"title": SECTION_TITLES[7], "body": _normalize_section(section_5)},
        {"title": SECTION_TITLES[6], "body": _normalize_section(section_4)},
        {"title": SECTION_TITLES[9], "body": _normalize_section(_m3_status_table("1H PA SLOT", one_h_no_slot, names, with_status=True))},
        {"title": SECTION_TITLES[10], "body": _normalize_section(_m3_status_table("PERSONAL GA", personal_ga, names, with_status=True))},
    ]
    snapshot = {
        "report_day": report_day.isoformat(),
        "tomorrow": tomorrow.isoformat(),
        "counts": {section["title"]: section["body"].count("\n- ") + (1 if section["body"].startswith("- ") else 0) for section in sections},
    }
    return tomorrow, sections, snapshot


def _normalize_report_status(value: str | None) -> str:
    status = str(value or "TODO").strip().upper().replace(" ", "_")
    if status in {"COMPLETED", "COMPLETE"}:
        return "DONE"
    if status in {"TO_DO", "TO-DO"}:
        return "TODO"
    if status in {"INPROGRESS", "IN-PROGRESS"}:
        return "IN_PROGRESS"
    if status in {"WAITING", "WAITING_CONFIRMATION", "PENDING_CONFIRMATION"}:
        return "WAITING_CONFIRMATION"
    if status in {"TODO", "IN_PROGRESS", "WAITING_CONFIRMATION", "DONE"}:
        return status
    return "TODO"


def _task_lines(
    tasks: list[Task],
    names: dict[Any, str],
    assignee_ids_by_task: dict[Any, set[Any]] | None = None,
    *,
    include_status: bool = False,
) -> list[str]:
    if not tasks:
        return ["(Asnje detyre)"]
    ordered = sorted(tasks, key=lambda task: (_task_owners(task, names, assignee_ids_by_task), task.title or ""))
    return [_task_line(task, names, assignee_ids_by_task, include_status=include_status) for task in ordered]


def _status_group_section(title: str, tasks: list[Task], names: dict[Any, str], report_day: date) -> list[str]:
    today_tasks = [task for task in tasks if _task_day(task) == report_day]
    todo = [task for task in today_tasks if str(task.status or "").upper() == "TODO" and _is_open(task)]
    in_progress = [task for task in today_tasks if str(task.status or "").upper() == "IN_PROGRESS" and _is_open(task)]
    done = [
        task for task in tasks
        if str(task.status or "").upper() in {"DONE", "COMPLETED"}
        and (_task_day(task) == report_day or _local_date(task.completed_at) == report_day)
    ]
    late = [task for task in tasks if _is_open(task) and _late_days(task) > 0]
    return [
        f"{title}:",
        *_m3_status_table("TODO", todo, names),
        "",
        *_m3_status_table("IN PROGRESS", in_progress, names),
        "",
        *_m3_status_table("DONE", done, names),
        "",
        *_m3_status_table("LATE", late, names, include_late_days=True),
    ]


async def _m3_finance_ga_section(db: AsyncSession, tasks: list[Task], names: dict[Any, str], report_day: date) -> str:
    assignee_ids_by_task = await _effective_task_assignee_ids(db, tasks)
    ga_users = await _users_by_initials(db, "GA")
    ga_user_ids = {user.id for user in ga_users}
    ga_tasks = [
        task for task in tasks
        if ga_user_ids.intersection(assignee_ids_by_task.get(task.id, set()))
        and (
            _task_day(task) == report_day
            or _local_date(task.completed_at) == report_day
            or _late_days(task) > 0
        )
    ]

    finance_department = (
        await db.execute(select(Department).where(Department.name.ilike("finance")))
    ).scalar_one_or_none()
    if finance_department is None:
        hv_tasks: list[Task] = []
    else:
        finance_tasks = [task for task in tasks if task.department_id == finance_department.id]
        hv_tasks = [
            task for task in finance_tasks
            if _task_day(task) == report_day
            or _local_date(task.completed_at) == report_day
            or _late_days(task) > 0
        ]

    return _normalize_section([
        *_status_group_section("GA TASKS", ga_tasks, names, report_day),
        "",
        *_status_group_section("HV TASKS", hv_tasks, names, report_day),
    ])


def _system_row_key(task: Task) -> tuple[str, str, str, str, str]:
    return (
        str(task.system_template_origin_id or ""),
        task.title or "",
        (_local_date(task.start_date) or "").isoformat() if _local_date(task.start_date) else "",
        (_local_date(task.due_date) or "").isoformat() if _local_date(task.due_date) else "",
        (_local_date(getattr(task, "planned_date", None) or task.original_due_date) or "").isoformat()
        if _local_date(getattr(task, "planned_date", None) or task.original_due_date)
        else "",
    )


def _dedupe_system_task_rows(tasks: list[Task]) -> list[Task]:
    by_key: dict[tuple[str, str, str, str, str], Task] = {}
    for task in tasks:
        key = _system_row_key(task)
        existing = by_key.get(key)
        if existing is None or _late_days(task) > _late_days(existing):
            by_key[key] = task
    return sorted(by_key.values(), key=lambda task: (-_late_days(task), _clean_task_title(task.title)))


def _meeting_lines(meetings: list[Meeting]) -> list[str]:
    if not meetings:
        return ["(Asnje takim)"]
    return [
        f"- {_local_time(meeting.starts_at)}: {_clean_task_title(meeting.title)}"
        for meeting in sorted(meetings, key=lambda m: m.starts_at or datetime.min)
    ]


def _meeting_group_title(title: str) -> list[str]:
    return [title]


def _meeting_status_checkbox_table(meetings: list[Meeting], status_by_meeting: dict[Any, str]) -> list[str]:
    border = "+----+-------+----------+------------------------------------------------------------------+"
    rows = [
        border,
        f"| {'NR':<2} | {'TIME':<5} | {'MBAJTUR?':<8} | {'TITLE':<64} |",
        border,
    ]
    if not meetings:
        rows.append(f"| {'-':<2} | {'-':<5} | {'':<8} | {'(Asnje takim)':<64} |")
        rows.append(border)
        return rows
    for index, meeting in enumerate(sorted(meetings, key=lambda item: item.starts_at or datetime.min), start=1):
        status = status_by_meeting.get(meeting.id, "")
        title_lines = _wrap_fixed_width(_clean_task_title(meeting.title), 64)
        status_icon = "\u2713" if status == "held" else "\u2715" if status == "canceled" else ""
        rows.append(
            f"| {index:<2} | {_local_time(meeting.starts_at):<5} | {status_icon:<8} | {title_lines[0]:<64} |"
        )
        for line in title_lines[1:]:
            rows.append(f"| {'':<2} | {'':<5} | {'':<8} | {line:<64} |")
        rows.append(border)
    return rows


async def _today_meeting_status_section(db: AsyncSession, meetings: list[Meeting], report_day: date) -> str:
    statuses = (
        await db.execute(
            select(MeetingOccurrenceStatus).where(MeetingOccurrenceStatus.occurrence_date == report_day)
        )
    ).scalars().all()
    status_by_meeting = {row.meeting_id: row.status for row in statuses}
    external = [meeting for meeting in meetings if getattr(meeting, "meeting_type", None) == "external"]
    internal = [meeting for meeting in meetings if getattr(meeting, "meeting_type", None) != "external"]

    return _normalize_section([
        *_meeting_group_title("TAKIMET EXTERNE"),
        *_meeting_status_checkbox_table(external, status_by_meeting),
        "",
        *_meeting_group_title("TAKIMET INTERNE"),
        *_meeting_status_checkbox_table(internal, status_by_meeting),
    ])


async def _common_view_items(day: date) -> dict[str, list[dict[str, Any]]]:
    base_url = os.getenv("PRIMEFLOW_API_BASE_URL")
    if not base_url:
        return {}
    client = PrimeFlowClient(
        base_url.rstrip("/"),
        os.getenv("PRIMEFLOW_EMAIL"),
        os.getenv("PRIMEFLOW_PASSWORD"),
        os.getenv("PRIMEFLOW_ACCESS_TOKEN"),
    )
    try:
        payload = await client.common_view(day)
    except Exception:
        return {}
    return payload.get("items") or {}


def _item_date(item: dict[str, Any]) -> date | None:
    for key in ("date", "day", "report_date", "startDate", "planned_for", "due_date"):
        raw = item.get(key)
        if raw:
            try:
                return date.fromisoformat(str(raw)[:10])
            except ValueError:
                continue
    return None


def _common_title(item: dict[str, Any]) -> str:
    raw = item.get("task_title") or item.get("title") or item.get("task") or item.get("note") or ""
    return _clean_task_title(str(raw))


def _common_owner(item: dict[str, Any]) -> str:
    assignees = item.get("assignees") or item.get("assigned_users") or item.get("owners")
    if isinstance(assignees, list):
        initials = []
        for assignee in assignees:
            if isinstance(assignee, dict):
                label = assignee.get("full_name") or assignee.get("username") or assignee.get("email") or assignee.get("name")
            else:
                label = assignee
            value = _initials(str(label or ""))
            if value != "-" and value not in initials:
                initials.append(value)
        if initials:
            return " ".join(initials)
    bz_with_label = str(item.get("bzWithLabel") or item.get("bz_with_label") or "").strip()
    if bz_with_label:
        initials = [
            value.strip().upper()
            for value in re.split(r"[,;/\s]+", bz_with_label)
            if value.strip()
        ]
        if initials:
            return " ".join(dict.fromkeys(initials))
    return _initials(str(item.get("person") or item.get("owner") or item.get("employee") or item.get("assignee_name") or ""))


def _common_task_status(item: dict[str, Any]) -> str:
    raw = item.get("status") or item.get("task_status") or item.get("state") or ""
    return _normalize_report_status(str(raw) if raw else "TODO")


def _common_task_lines(items: list[dict[str, Any]], day: date, *, include_status: bool = False) -> list[str]:
    lines = []
    seen = set()
    for item in items:
        if _item_date(item) != day:
            continue
        title = _common_title(item)
        owner = _common_owner(item)
        key = (item.get("id"), title, owner)
        if key in seen:
            continue
        seen.add(key)
        if include_status:
            lines.append(f"- [{_common_task_status(item)}] {owner}: {title}")
        else:
            lines.append(f"- {owner}: {title}")
    return lines


async def _bz_alignment_lines(
    db: AsyncSession,
    day: date,
    tasks: list[Task],
    names: dict[Any, str],
    assignee_ids_by_task: dict[Any, set[Any]],
    *,
    include_status: bool = False,
) -> list[str]:
    templates = (
        await db.execute(
            select(SystemTaskTemplate)
            .where(SystemTaskTemplate.is_active.is_(True))
            .where(SystemTaskTemplate.approval_status == CommonApprovalStatus.approved)
        )
    ).scalars().all()
    template_ids = [template.id for template in templates]
    if not template_ids:
        return []

    rows = (
        await db.execute(
            select(SystemTaskTemplateAlignmentUser.template_id, SystemTaskTemplateAlignmentUser.user_id)
            .where(SystemTaskTemplateAlignmentUser.template_id.in_(template_ids))
        )
    ).all()
    alignment_users_map: dict[Any, list[Any]] = {}
    user_ids: set[Any] = set()
    for template_id, user_id in rows:
        alignment_users_map.setdefault(template_id, []).append(user_id)
        user_ids.add(user_id)
    if not user_ids:
        return []

    for template in templates:
        for user_id in (template.assignee_ids or []):
            user_ids.add(user_id)
        if template.default_assignee_id:
            user_ids.add(template.default_assignee_id)

    users = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
    users_map = {user.id: user for user in users}
    ga_user = next((user for user in users if (user.username or "").lower() == "gane.arifaj"), None)
    ga_user_id = ga_user.id if ga_user else None
    if ga_user_id is None:
        ga_candidates = [user for user in users if _initials(user.full_name or user.username or user.email) == "GA"]
        ga_user_id = ga_candidates[0].id if ga_candidates else None

    task_owners_by_template: dict[Any, list[str]] = {}
    task_status_by_template: dict[Any, str] = {}
    status_rank = {"IN_PROGRESS": 3, "WAITING_CONFIRMATION": 2, "TODO": 1, "DONE": 0}
    for task in tasks:
        template_id = task.system_template_origin_id
        if not template_id:
            continue
        if _local_date(task.start_date or task.due_date or task.created_at) != day:
            continue
        owners = task_owners_by_template.setdefault(template_id, [])
        for owner in _task_owners(task, names, assignee_ids_by_task).split():
            if owner != "-" and owner not in owners:
                owners.append(owner)
        status = _normalize_report_status(task.status)
        current = task_status_by_template.get(template_id)
        if current is None or status_rank.get(status, 0) > status_rank.get(current, 0):
            task_status_by_template[template_id] = status

    lines: list[str] = []
    seen: set[tuple[Any, str]] = set()
    for template in sorted(templates, key=lambda item: (item.alignment_time or datetime.min.time(), item.title or "")):
        alignment_ids = alignment_users_map.get(template.id, [])
        if not alignment_ids or (ga_user_id is not None and ga_user_id not in alignment_ids):
            continue
        if not matches_template_date(template, day):
            continue
        owners = list(task_owners_by_template.get(template.id) or [])
        if not owners:
            assignee_ids = list(template.assignee_ids or [])
            if not assignee_ids and template.default_assignee_id:
                assignee_ids = [template.default_assignee_id]
            owners = [
                _initials(users_map[user_id].full_name or users_map[user_id].username or users_map[user_id].email)
                for user_id in assignee_ids
                if user_id in users_map
            ]
        owner_label = " ".join(dict.fromkeys([owner for owner in owners if owner != "-"])) or "-"
        title = _clean_task_title(template.title)
        key = (template.id, day.isoformat())
        if key in seen:
            continue
        seen.add(key)
        status = task_status_by_template.get(template.id, "TODO")
        if include_status:
            lines.append(f"- [{status}] {owner_label}: {title}")
        else:
            lines.append(f"- {owner_label}: {title}")
    return lines


def _common_meeting_lines(items: list[dict[str, Any]], day: date) -> list[str]:
    lines = []
    seen = set()
    for item in items:
        if _item_date(item) != day:
            continue
        title = _clean_task_title(str(item.get("title") or item.get("task_title") or "Meeting"))
        time_value = str(item.get("time") or item.get("when") or "").strip()
        prefix = f"{time_value}: " if time_value else ""
        key = (item.get("id"), title, time_value)
        if key in seen:
            continue
        seen.add(key)
        lines.append(f"- {prefix}{title}")
    return lines


def _prefer_common(common_lines: list[str], fallback_lines: list[str]) -> list[str]:
    return common_lines if common_lines else [line for line in fallback_lines if not line.startswith("(Asnje")]


def _prefer_owned_common(common_lines: list[str], fallback_lines: list[str]) -> list[str]:
    usable_common = [
        line for line in common_lines
        if not re.match(r"^\s*-\s*-+\s*:", line)
    ]
    return usable_common if usable_common else [line for line in fallback_lines if not line.startswith("(Asnje")]


def _strip_list_marker(value: str) -> str:
    return re.sub(r"^\s*-\s*", "", value).strip()


def _tomorrow_meeting_table(title: str, lines: list[str]) -> list[str]:
    border = "+----+-------+------------------------------------------------------------------+"
    rows = [
        f"{title}:",
        border,
        f"| {'NR':<2} | {'TIME':<5} | {'TITLE':<64} |",
        border,
    ]
    values = [_strip_list_marker(line) for line in lines if line and not line.startswith("(")]
    if not values:
        rows.append(f"| {'-':<2} | {'-':<5} | {'(Asnje takim)':<64} |")
        rows.append(border)
        return rows
    for index, value in enumerate(values, start=1):
        match = re.match(r"^(\d{1,2}:\d{2})\s*:\s*(.+)$", value)
        time_value = match.group(1) if match else "-"
        title_value = match.group(2) if match else value
        title_lines = _wrap_fixed_width(title_value, 64)
        rows.append(f"| {index:<2} | {time_value:<5} | {title_lines[0]:<64} |")
        for line in title_lines[1:]:
            rows.append(f"| {'':<2} | {'':<5} | {line:<64} |")
        rows.append(border)
    return rows


def _parse_owned_task_line(value: str) -> tuple[str, str, str]:
    """Return (status, owner, title) from ``[STATUS] WHO: title`` or ``WHO: title``."""
    status = ""
    remainder = value
    status_match = TASK_LINE_STATUS.match(remainder)
    if status_match:
        status = _normalize_report_status(status_match.group(1))
        remainder = remainder[status_match.end() :]
    owner = "-"
    title_value = remainder
    if ":" in remainder:
        owner, title_value = remainder.split(":", 1)
        owner = owner.strip() or "-"
        title_value = title_value.strip()
    return status, owner, title_value


def _title_with_status_marker(title: str, status: str | None) -> str:
    cleaned = _strip_status_markers(title or "").rstrip()
    if not status:
        return cleaned
    return f"{cleaned} [[st:{_normalize_report_status(status)}]]"


def _split_status_marker(value: str) -> tuple[str, str]:
    """Return (title, status). Marker may sit mid-cell after wrap/merge, so search anywhere."""
    text = value or ""
    matches = list(re.finditer(r"\s*\[\[\s*st\s*:?\s*([A-Z_]+)\s*\]\]", text, flags=re.I))
    if not matches:
        return text.rstrip(), ""
    status = _normalize_report_status(matches[-1].group(1))
    cleaned = text
    for match in reversed(matches):
        cleaned = cleaned[: match.start()] + cleaned[match.end() :]
    return re.sub(r"\s+", " ", cleaned).strip(), status


def _strip_status_markers(value: str) -> str:
    return re.sub(r"\s*\[\[\s*st\s*:?\s*[A-Z_]+\s*\]\]", "", value or "", flags=re.I)


def _append_status_marker_to_lines(title_lines: list[str], status: str | None, width: int) -> list[str]:
    """Keep [[st:STATUS]] on the last wrapped line so merge/display still finds it."""
    lines = list(title_lines) or ["-"]
    if not status:
        return [f"{lines[0]:<{width}}", *[f"{line:<{width}}" for line in lines[1:]]]
    marker = f" [[st:{_normalize_report_status(status)}]]"
    padded = [f"{line:<{width}}" for line in lines]
    padded[-1] = f"{padded[-1].rstrip()}{marker}"
    return padded


def _tomorrow_task_table(title: str, lines: list[str], *, with_status: bool = False) -> list[str]:
    who_width = 20
    title_width = 64
    border = f"+----+{'-' * (who_width + 2)}+{'-' * (title_width + 2)}+"
    rows = [
        f"{title}:",
        border,
        f"| {'NR':<2} | {'WHO':<{who_width}} | {'TITLE':<{title_width}} |",
        border,
    ]
    values = [_strip_list_marker(line) for line in lines if line and not line.startswith("(")]
    if not values:
        rows.append(f"| {'-':<2} | {'-':<{who_width}} | {'(Asnje detyre)':<{title_width}} |")
        rows.append(border)
        return rows
    for index, value in enumerate(values, start=1):
        status, owner, title_value = _parse_owned_task_line(value)
        if with_status:
            title_value = _strip_status_markers(title_value)
            status = status or "TODO"
        # Keep all assignees in one WHO cell so one task is never split by a mid-row border.
        owner_display = re.sub(r"\s+", " ", owner).strip() or "-"
        title_lines = _wrap_fixed_width(title_value, title_width)
        padded_titles = _append_status_marker_to_lines(
            title_lines, status if with_status else None, title_width
        )
        rows.append(f"| {index:<2} | {owner_display:<{who_width}} | {padded_titles[0]} |")
        for line in padded_titles[1:]:
            rows.append(f"| {'':<2} | {'':<{who_width}} | {line} |")
        rows.append(border)
    return rows


def _tomorrow_common_section(
    *,
    common_items: dict[str, list[dict[str, Any]]],
    tomorrow: date,
    fallback_external: list[str],
    fallback_internal: list[str],
    fallback_bz: list[str],
    fallback_blocked: list[str],
    with_status: bool = False,
) -> list[str]:
    external = _prefer_common(_common_meeting_lines(common_items.get("external") or [], tomorrow), fallback_external)
    internal = _prefer_common(_common_meeting_lines(common_items.get("internal") or [], tomorrow), fallback_internal)
    bz = _prefer_owned_common(
        _common_task_lines(common_items.get("bz") or [], tomorrow, include_status=with_status),
        fallback_bz,
    )
    blocked = _prefer_common(
        _common_task_lines(common_items.get("blocked") or [], tomorrow, include_status=with_status),
        fallback_blocked,
    )
    return [
        *_tomorrow_meeting_table("TAKIMET EXTERNE", external),
        "",
        *_tomorrow_meeting_table("TAKIMET INTERNE", internal),
        "",
        *_tomorrow_task_table("BZ ME GA", bz, with_status=with_status),
        "",
        *_tomorrow_task_table("BLLOK", blocked, with_status=with_status),
    ]


def _leave_lines(entries: list[tuple[CommonEntry, bool, str | None, str | None, str | None, bool]], names: dict[Any, str]) -> list[str]:
    border = "+----+-------+------------------------------------------------------------------+"
    lines = [
        border,
        f"| {'NR':<2} | {'WHO':<5} | {'TIME':<64} |",
        border,
    ]
    if not entries:
        lines.append(f"| {'-':<2} | {'-':<5} | {'(Asnje detyre)':<64} |")
        lines.append(border)
        return lines
    for index, (entry, full_day, start_time, end_time, note, is_all_users) in enumerate(entries, start=1):
        person = "ALL" if is_all_users else _initials(names.get(entry.assigned_to_user_id or entry.created_by_user_id) or entry.title)
        when = "Full day" if full_day else f"{start_time or '-'}-{end_time or '-'}"
        cleaned_note = TECHNICAL_TAG.sub("", note or "").strip() if note else ""
        cleaned_note = re.sub(r"\s+", " ", cleaned_note).strip()
        detail = f" - {cleaned_note}" if cleaned_note else ""
        time_lines = _wrap_fixed_width(f"{when}{detail}", 64)
        lines.append(f"| {index:<2} | {person:<5} | {time_lines[0]:<64} |")
        for line in time_lines[1:]:
            lines.append(f"| {'':<2} | {'':<5} | {line:<64} |")
        lines.append(border)
    return lines


def _normalize_section(lines: list[str]) -> str:
    return "\n".join(lines).replace("\n\n\n", "\n\n").strip()


def render_plain_text(subject: str, report_day: date, tomorrow: date, sections: list[dict[str, str]]) -> str:
    blocks = [subject, f"Sot: {report_day:%d.%m.%Y}", f"Neser: {tomorrow:%d.%m.%Y}", ""]
    current_group = ""
    for index, section in enumerate(sections, 1):
        group = "MANUAL QUESTIONS" if section["title"] in MANUAL_SECTION_TITLES else "AUTO-FILLED FROM PRIMEFLOW"
        if group != current_group:
            blocks.append(group)
            current_group = group
        blocks.append(
            f"{index}. {section['title']}\n{_strip_status_markers(section.get('body') or '')}".strip()
        )
    return "\n\n".join(blocks)

    return "MANUAL QUESTIONS" if title in MANUAL_SECTION_TITLES else "AUTO-FILLED FROM PRIMEFLOW"


def _render_group_label_html(label: str) -> str:
    return (
        "<div style=\"margin:22px 0 10px;padding:9px 11px;background:#f1f5f9;"
        "border:1px solid #d7dee8;color:#334155;font-family:Arial,sans-serif;"
        "font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;\">"
        f"{html.escape(label)}"
        "</div>"
    )


def _parse_ascii_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _table_tone_from_label(label: str) -> str:
    normalized = label.strip().upper().rstrip(":")
    if normalized in {"TODO", "DETYRAT E REJA"}:
        return "todo"
    if normalized == "IN PROGRESS":
        return "in-progress"
    if normalized in {"WAITING CONFIRMATION", "WAITING_CONFIRMATION"}:
        return "waiting"
    if normalized == "DONE":
        return "done"
    if normalized == "LATE":
        return "late"
    if normalized == "ME DEADLINE":
        return "deadline"
    if normalized == "NOTES":
        return "notes"
    return ""


def _table_tone_from_status(status: str) -> str:
    return _table_tone_from_label(status.replace("_", " "))


def _table_tone_styles(tone: str) -> tuple[str, str]:
    if tone == "todo":
        return "#fbcfe8", "#111827"
    if tone == "in-progress":
        return "#fef3c7", "#111827"
    if tone == "waiting":
        return "#ffedd5", "#9a3412"
    if tone == "done":
        return "#d4ffe1", "#111827"
    if tone == "late":
        return "#fee2e2", "#111827"
    if tone == "deadline":
        return "#dc2626", "#ffffff"
    if tone == "notes":
        return "#dbeafe", "#111827"
    return "#f8fafc", "#111827"


def _render_ascii_table_html(lines: list[str], tone: str = "", caption: str = "") -> str:
    table_rows = [_parse_ascii_cells(line) for line in lines if line.startswith("|")]
    if not table_rows:
        return ""
    header, body_rows = table_rows[0], table_rows[1:]
    header, body_rows = _normalize_meeting_status_table(header, body_rows)
    body_rows = _merge_ascii_continuation_rows(header, body_rows)
    status_index = next((index for index, cell in enumerate(header) if cell.upper() == "STATUS"), None)
    title_index = next((index for index, cell in enumerate(header) if cell.upper() == "TITLE"), None)
    row_tones: list[str] = []
    cleaned_body_rows: list[list[str]] = []
    for row in body_rows:
        row = list(row)
        row_tone = tone
        if status_index is not None and len(row) > status_index:
            row_tone = _table_tone_from_status(row[status_index]) or row_tone
        if title_index is not None and len(row) > title_index:
            cleaned_title, marker_status = _split_status_marker(row[title_index])
            row[title_index] = cleaned_title
            if marker_status:
                row_tone = _table_tone_from_status(marker_status) or row_tone
        row_tones.append(row_tone)
        cleaned_body_rows.append(row)
    body_rows = cleaned_body_rows
    if status_index is not None:
        header = [cell for index, cell in enumerate(header) if index != status_index]
        body_rows = [
            [cell for index, cell in enumerate(row) if index != status_index]
            for row in body_rows
        ]
    column_widths = _email_column_widths(header)
    header_cell_style = (
        "background:#e5e7eb;color:#111827;text-align:left;font-weight:700;"
        "border:1px solid #cbd5e1;padding:4px 5px;vertical-align:top;"
    )
    default_body_bg, default_body_color = _table_tone_styles(tone)
    body_cell_style = (
        f"background:{default_body_bg};color:{default_body_color};border:1px solid #cbd5e1;"
        "padding:4px 5px;vertical-align:top;"
    )
    canceled_cell_style = (
        "background:#fee2e2;color:#991b1b;border:1px solid #cbd5e1;"
        "padding:4px 5px;vertical-align:top;"
    )
    disk_yes_cell_style = (
        "background:#dcfce7;color:#166534;border:1px solid #cbd5e1;"
        "padding:4px 5px;vertical-align:top;font-weight:700;text-align:center;"
    )
    disk_no_cell_style = (
        "background:#fee2e2;color:#991b1b;border:1px solid #cbd5e1;"
        "padding:4px 5px;vertical-align:top;font-weight:700;text-align:center;"
    )
    header_html = "".join(
        f"<th{_email_column_width_attr(column_widths[index])} style=\"{header_cell_style}{_email_column_width_style(column_widths[index])}{_email_column_cell_style(cell)}\">"
        f"{html.escape(cell)}</th>"
        for index, cell in enumerate(header)
    )
    colgroup_html = "".join(
        f"<col{_email_column_width_attr(width)} style=\"{_email_column_width_style(width)}\" />"
        for width in column_widths
    )
    canceled_index = next((index for index, cell in enumerate(header) if cell.upper() == "ANULUAR"), None)
    meeting_status_index = next((index for index, cell in enumerate(header) if cell.upper() == "MBAJTUR?"), None)
    disk_index = next((index for index, cell in enumerate(header) if cell.upper() == "DISK"), None)
    table_class = f"report-table report-table-{tone}" if tone else "report-table"
    body_html_parts = []
    for row_index, row in enumerate(body_rows):
        row_tone = row_tones[row_index] if row_index < len(row_tones) else tone
        if row_tone:
            row_bg, row_color = _table_tone_styles(row_tone)
            row_body_style = (
                f"background:{row_bg};color:{row_color};border:1px solid #cbd5e1;"
                "padding:4px 5px;vertical-align:top;"
            )
        else:
            row_body_style = body_cell_style
        is_canceled = (
            canceled_index is not None
            and len(row) > canceled_index
            and bool(row[canceled_index].strip())
        )
        cell_style = canceled_cell_style if is_canceled else row_body_style
        row_cells = []
        for index, cell in enumerate(row):
            current_cell_style = cell_style
            current_cell = cell
            if tone == "notes" and disk_index is not None and index == disk_index:
                disk_value = cell.strip().upper()
                if disk_value == "YES":
                    current_cell_style = disk_yes_cell_style
                elif disk_value == "NO":
                    current_cell_style = disk_no_cell_style
            if meeting_status_index is not None and index == meeting_status_index:
                symbol = cell.strip()
                if symbol == "\u2713":
                    current_cell_style = (
                        "background:#f8fafc;color:#047857;border:1px solid #cbd5e1;"
                        "padding:4px 5px;vertical-align:top;font-weight:700;text-align:center;"
                    )
                elif symbol == "\u2715":
                    current_cell_style = (
                        "background:#f8fafc;color:#dc2626;border:1px solid #cbd5e1;"
                        "padding:4px 5px;vertical-align:top;font-weight:700;text-align:center;"
                    )
            row_cells.append(
                f"<td data-label=\"{html.escape(header[index])}\"{_email_column_width_attr(column_widths[index])} style=\"{current_cell_style}{_email_column_width_style(column_widths[index])}{_email_column_cell_style(header[index])}\">"
                f"{html.escape(current_cell).replace(chr(10), '<br>')}</td>"
            )
        body_html_parts.append(
            "<tr>"
            + "".join(row_cells)
            + "</tr>"
        )
    body_html = "".join(body_html_parts)
    caption_html = ""
    if caption.strip():
        caption_html = (
            "<tr><td style=\"background:#f8fafc;color:#111827;font-weight:700;"
            "border:1px solid #cbd5e1;border-bottom:0;padding:8px 10px;"
            "font-family:Arial,sans-serif;font-size:13px;\">"
            f"{html.escape(caption.strip())}</td></tr>"
        )
    return (
        "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" "
        "style=\"width:100%;border-collapse:collapse;margin:8px 0 12px;\">"
        f"{caption_html}<tr><td style=\"padding:0;\">"
        f"<table class=\"{table_class}\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" "
        "style=\"width:100%;border-collapse:collapse;table-layout:auto;font-size:12px;line-height:1.3;font-family:Arial,sans-serif;\">"
        f"<colgroup>{colgroup_html}</colgroup><thead><tr>{header_html}</tr></thead><tbody>{body_html}</tbody></table>"
        "</td></tr></table>"
    )


def _normalize_meeting_status_table(header: list[str], body_rows: list[list[str]]) -> tuple[list[str], list[list[str]]]:
    """Render older saved meeting drafts with the current compact status column."""
    normalized = [cell.strip().upper() for cell in header]
    if not {"MBAJTUR", "ANULUAR", "PA STATUS"}.issubset(set(normalized)):
        return header, body_rows
    if "TITLE" not in normalized:
        return header, body_rows

    def cell_at(row: list[str], name: str) -> str:
        try:
            index = normalized.index(name)
        except ValueError:
            return ""
        return row[index].strip() if len(row) > index else ""

    new_header: list[str] = []
    for cell in header:
        name = cell.strip().upper()
        if name in {"MBAJTUR", "ANULUAR", "PA STATUS"}:
            continue
        if name == "TITLE":
            new_header.append("MBAJTUR?")
        new_header.append(cell)

    new_rows: list[list[str]] = []
    for row in body_rows:
        status_icon = "\u2713" if cell_at(row, "MBAJTUR") else "\u2715" if cell_at(row, "ANULUAR") else ""
        new_row: list[str] = []
        for index, cell in enumerate(header):
            name = cell.strip().upper()
            if name in {"MBAJTUR", "ANULUAR", "PA STATUS"}:
                continue
            if name == "TITLE":
                new_row.append(status_icon)
            new_row.append(row[index] if len(row) > index else "")
        new_rows.append(new_row)
    return new_header, new_rows


def _email_column_width_attr(width: str) -> str:
    return "" if width == "auto" else f" width=\"{width}\""


def _email_column_width_style(width: str) -> str:
    return "" if width == "auto" else f"width:{width}px;"


def _email_column_cell_style(header_cell: str) -> str:
    name = header_cell.strip().upper()
    if name in {"NR", "TIME", "ORA", "KOHA", "DISK", "LATE", "FROM", "DATA", "DATE", "MBAJTUR", "MBAJTUR?", "ANULUAR", "PA STATUS"}:
        return "white-space:nowrap;"
    if name == "WHO":
        return "white-space:normal;word-break:normal;overflow-wrap:break-word;"
    return "white-space:normal;word-break:normal;overflow-wrap:break-word;"


def _email_column_widths(header: list[str]) -> list[str]:
    """Give utility columns only the space they need; reserve the rest for title/note text."""
    if not header:
        return []
    fixed_by_name = {
        "NR": "24",
        "WHO": "34",
        "FROM": "38",
        "TIME": "46",
        "ORA": "46",
        "KOHA": "46",
        "DATA": "62",
        "DATE": "62",
        "DISK": "42",
        "LATE": "54",
        "MBAJTUR": "58",
        "MBAJTUR?": "62",
        "ANULUAR": "58",
        "PA STATUS": "64",
    }
    content_names = {"TITLE", "NOTE", "SHENIMI", "PERSHKRIMI", "DESCRIPTION"}
    normalized = [cell.strip().upper() for cell in header]
    widths = ["auto" if name in content_names else fixed_by_name.get(name, "56") for name in normalized]
    if normalized and not any(name in content_names for name in normalized):
        widths[-1] = "auto"
    return widths


def _primary_text_column_index(header: list[str]) -> int:
    normalized = [cell.strip().upper() for cell in header]
    for name in ("NOTE", "TITLE", "SHENIMI", "PERSHKRIMI", "DESCRIPTION"):
        if name in normalized:
            return normalized.index(name)
    return min(2, max(len(header) - 1, 0))


def _merge_ascii_continuation_rows(header: list[str], rows: list[list[str]]) -> list[list[str]]:
    if not header:
        return rows
    width = len(header)
    text_index = _primary_text_column_index(header)
    nr_index = next((index for index, cell in enumerate(header) if cell.strip().upper() == "NR"), 0)
    merged: list[list[str]] = []
    for row in rows:
        normalized = (row + [""] * width)[:width]
        has_text_continuation = bool(normalized[text_index].strip())
        other_cells_empty = all(
            not normalized[index].strip()
            for index in range(width)
            if index != text_index
        )
        is_wrapped_row = merged and not normalized[nr_index].strip() and any(cell.strip() for cell in normalized)
        if is_wrapped_row:
            previous = merged[-1]
            for index, value in enumerate(normalized):
                stripped = value.strip()
                if not stripped:
                    continue
                previous[index] = (
                    f"{previous[index]}\n{stripped}"
                    if previous[index].strip()
                    else stripped
                )
        elif merged and has_text_continuation and other_cells_empty:
            previous = merged[-1]
            previous[text_index] = (
                f"{previous[text_index]}\n{normalized[text_index].strip()}"
                if previous[text_index].strip()
                else normalized[text_index].strip()
            )
        else:
            merged.append(normalized)
    return merged


def _ascii_table_is_empty(lines: list[str]) -> bool:
    table_rows = [_parse_ascii_cells(line) for line in lines if line.startswith("|")]
    if len(table_rows) != 2:
        return False
    row = table_rows[1]
    return any(cell in {"(Asnje detyre)", "(Asnje takim)"} for cell in row)


def _is_keyed_prompt_line(value: str) -> bool:
    stripped = value.strip()
    keyed = re.match(r"^([A-Z][A-Z0-9 /&()?.+-]*:)\s*(.*)$", stripped)
    return bool(keyed and keyed.group(1)[:-1] == keyed.group(1)[:-1].upper())


def _render_keyed_prompt_html(line: str) -> str:
    stripped = line.strip()
    keyed = re.match(r"^([A-Z][A-Z0-9 /&()?.+-]*:)\s*(.*)$", stripped)
    if keyed and keyed.group(1)[:-1] == keyed.group(1)[:-1].upper():
        label, rest = keyed.group(1), keyed.group(2)
        rendered = f"<strong>{html.escape(label)}</strong>"
        if rest:
            rendered += f" {html.escape(rest)}"
    else:
        rendered = html.escape(stripped)
    return (
        "<div style=\"background:#f8fafc;border:1px solid #e5e7eb;padding:8px 10px;"
        "margin:0 0 8px;font-family:Arial,sans-serif;font-size:13px;line-height:1.45;color:#0f172a;\">"
        f"{rendered}</div>"
    )


def _render_text_block_html(lines: list[str]) -> str:
    non_empty = [line for line in lines if line.strip()]
    if non_empty and all(_is_keyed_prompt_line(line) for line in non_empty):
        return "".join(_render_keyed_prompt_html(line) for line in non_empty)

    rendered_lines = []
    for line in lines:
        stripped = line.strip()
        keyed = re.match(r"^([A-Z][A-Z0-9 /&()?.+-]*:)\s*(.*)$", stripped)
        if keyed and keyed.group(1)[:-1] == keyed.group(1)[:-1].upper():
            label, rest = keyed.group(1), keyed.group(2)
            rendered = f"<strong>{html.escape(label)}</strong>"
            if rest:
                rendered += f" {html.escape(rest)}"
            rendered_lines.append(rendered)
        elif stripped and len(stripped) <= 45 and stripped.endswith((": 0", ":")):
            rendered_lines.append(f"<strong>{html.escape(line)}</strong>")
        else:
            rendered_lines.append(html.escape(line))
    return (
        "<pre style=\"white-space:pre-wrap;font-family:Arial,sans-serif;font-size:13px;line-height:1.45;"
        "background:#f8fafc;border:1px solid #e5e7eb;padding:12px;margin:0;\">"
        f"{chr(10).join(rendered_lines).strip()}</pre>"
    )


def _render_section_body_html(body: str) -> str:
    lines = body.splitlines()
    chunks: list[str] = []
    text_buffer: list[str] = []
    index = 0

    def flush_text() -> None:
        if any(line.strip() for line in text_buffer):
            chunks.append(_render_text_block_html(text_buffer))
        text_buffer.clear()

    def current_table_tone() -> str:
        for previous in reversed(text_buffer):
            if previous.strip():
                return _table_tone_from_label(previous)
        return ""

    def mark_current_label_empty() -> None:
        for previous_index in range(len(text_buffer) - 1, -1, -1):
            stripped = text_buffer[previous_index].strip()
            if stripped:
                text_buffer[previous_index] = (
                    f"{text_buffer[previous_index]} 0"
                    if stripped.endswith(":")
                    else f"{text_buffer[previous_index]}: 0"
                )
                return

    def pop_current_table_label() -> str:
        for previous_index in range(len(text_buffer) - 1, -1, -1):
            stripped = text_buffer[previous_index].strip()
            if not stripped:
                continue
            if len(stripped) <= 45 and (stripped.endswith(":") or stripped.isupper() or re.match(r"^\d{1,2}:\d{2}:?$", stripped)):
                label = stripped
                del text_buffer[previous_index:]
                return label
            return ""
        return ""

    while index < len(lines):
        line = lines[index]
        if line.startswith("+-") and index + 1 < len(lines) and lines[index + 1].startswith("|"):
            tone = current_table_tone()
            table_lines: list[str] = []
            while index < len(lines) and (lines[index].startswith("+-") or lines[index].startswith("|")):
                table_lines.append(lines[index])
                index += 1
            if _ascii_table_is_empty(table_lines):
                mark_current_label_empty()
                continue
            caption = pop_current_table_label()
            flush_text()
            chunks.append(_render_ascii_table_html(table_lines, tone, caption))
            continue
        text_buffer.append(line)
        index += 1
    flush_text()
    return "".join(chunk for chunk in chunks if chunk)


def render_html(subject: str, report_day: date, tomorrow: date, sections: list[dict[str, str]]) -> str:
    section_chunks: list[str] = []
    current_group = ""
    for index, section in enumerate(sections, 1):
        group = _section_group_label(section["title"])
        if group != current_group:
            section_chunks.append(_render_group_label_html(group))
            current_group = group
        section_chunks.append(
            "<div style=\"margin:22px 0 0;\">"
            f"<h2 style=\"font-size:14px;margin:0 0 8px;color:#0f172a;font-family:Arial,sans-serif;\">{index}. {html.escape(section['title'])}</h2>"
            f"{_render_section_body_html(section.get('body') or '')}"
            "</div>"
        )
    section_html = "".join(section_chunks)
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
body{{font-family:Arial,sans-serif;color:#111827;background:#f8fafc;margin:0;padding:24px}}
h1{{font-size:22px;margin:0 0 8px}}p{{margin:0 0 18px;color:#475569}}
h2{{font-size:14px;margin:22px 0 8px;color:#0f172a}}
@media only screen and (max-width:600px){{
body{{padding:8px}}
table,tbody,tr,td,div,pre{{max-width:100%!important;box-sizing:border-box!important}}
h1{{font-size:18px!important;line-height:1.2!important;white-space:normal!important}}
h2{{font-size:13px!important;line-height:1.25!important;white-space:normal!important;word-break:normal!important;overflow-wrap:anywhere!important}}
pre{{font-size:12px!important;padding:10px!important}}
.report-table{{width:100%!important;table-layout:auto!important}}
.report-table th,.report-table td{{font-size:11px!important;padding:3px 4px!important;line-height:1.25!important;word-break:normal!important;overflow-wrap:break-word!important}}
}}
</style></head><body style="font-family:Arial,sans-serif;color:#111827;background:#f8fafc;margin:0;padding:8px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f8fafc;border-collapse:collapse;">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-collapse:collapse;">
<tr><td style="padding:14px;">
<h1 style="font-size:22px;margin:0 0 8px;font-family:Arial,sans-serif;color:#111827;">{html.escape(subject)}</h1>
<p style="margin:0 0 18px;color:#475569;font-family:Arial,sans-serif;">Sot: {report_day:%d.%m.%Y} &nbsp; Neser: {tomorrow:%d.%m.%Y}</p>
{section_html}
</td></tr></table>
</td></tr></table>
</body></html>"""


async def send_meetings_report(subject: str, recipients: dict[str, list[str]], plain_text: str, html_body: str) -> dict[str, Any]:
    gmail = GmailService()
    return await gmail.send_verified(subject, recipients, plain_text, html_body, attachments=[])
