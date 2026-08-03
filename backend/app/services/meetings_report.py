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
from app.models.enums import CommonCategory
from app.models.meeting import Meeting
from app.models.meeting_occurrence_status import MeetingOccurrenceStatus
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.services.common_leave import parse_common_view_annual_leave
from app.services.daily_report_logic import business_days_between
from app.services.primeflow_report import GmailService, report_timezone
from app.services.primeflow_report import PrimeFlowClient
from app.services.std_feedback_tickets import std_tickets_report_section

REPORT_TYPE = "meetings_report"
SECTION_TITLES = [
    "(GA) M3 DET GA MBYLLJA ME HV?",
    "(GA) TIKETAT E STD DHE TONAT? RAPORTOHEN NE M3",
    "DET NE PROCES SISTEMIT - SYSTEM TASKS REPORT - LATE?",
    "DET. PA PROGRES (PINK)?",
    "N- (GA) PV/FESTE?",
    "N- (GA) TAKIMET EXTERNE/ TAKIMET INTERNE/ BZ ME GA/BLLOK?",
    "N- (GA) SHIKOHET COMMON VIEW NESER, VETEM DETYRAT E REJA ME TE KALTER, 08:00 DHE ME DEADLINE?",
    "TAKIMET PA KRY (KONTROLLO PLATFORMEN)?",
    "N- A KA DETYRA 1H PA SLOT?",
    "(GA/KA) KUSH KA DET PERSONALISHT?",
]
PERSONAL_GA_KA = re.compile(r"(^|[^A-Z])(GA|KA)([^A-Z]|$)|/[GK]A\s*:", re.I)
TECHNICAL_BLOCK = re.compile(r"\[\[\s*added\s*\]\].*?\[\[\s*/\s*added\s*\]\]", re.I | re.S)
TECHNICAL_TAG = re.compile(r"\[\[\s*/?\s*added\s*\]\]", re.I)
DUE_SUFFIX = re.compile(r"\s+due\s+\d{1,2}:\d{2}\s*$", re.I)
TITLE_PREFIX = re.compile(r"^[A-Z]{1,4}(?:/[A-Z]{1,4})?\s*:\s*", re.I)


def next_working_day(day: date) -> date:
    candidate = day + timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


def subject_for(day: date) -> str:
    return f"PrimeFlow Meetings Report - {day:%d.%m.%Y}"


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


def _task_line(task: Task, names: dict[Any, str]) -> str:
    owner = _initials(names.get(task.assigned_to))
    title = _clean_task_title(task.title)
    return f"- {owner}: {title}"


def _task_line_with_late_days(task: Task, names: dict[Any, str]) -> str:
    owner = _initials(names.get(task.assigned_to))
    title_lines = _wrap_fixed_width(_clean_task_title(task.title), 48)
    days = _late_days(task)
    late_label = f"{days} dite late" if days else "-"
    lines = [f"- {owner:<4} | {title_lines[0]:<48} | {late_label}"]
    lines.extend(f"  {'':<4} | {line:<48} |" for line in title_lines[1:])
    return "\n".join(lines)


def _wrap_fixed_width(value: str, width: int) -> list[str]:
    cleaned = re.sub(r"\s+", " ", value).strip()
    return textwrap.wrap(cleaned, width=width, break_long_words=False, break_on_hyphens=False) or ["-"]


def _m3_status_table(status_label: str, tasks: list[Task], names: dict[Any, str], *, include_late_days: bool = False) -> list[str]:
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
        title_lines = _wrap_fixed_width(_clean_task_title(task.title), 64)
        if include_late_days:
            late_label = f"{_late_days(task)} dite late" if _late_days(task) else "-"
            rows.append(f"| {index:<2} | {owner:<5} | {title_lines[0]:<64} | {late_label:<12} |")
        else:
            rows.append(f"| {index:<2} | {owner:<5} | {title_lines[0]:<64} |")
        for line in title_lines[1:]:
            if include_late_days:
                rows.append(f"| {'':<2} | {'':<5} | {line:<64} | {'':<12} |")
            else:
                rows.append(f"| {'':<2} | {'':<5} | {line:<64} |")
        rows.append(border)
    return rows


def _task_late_lines(tasks: list[Task], names: dict[Any, str]) -> list[str]:
    if not tasks:
        return ["(Asnje detyre)"]
    ordered = sorted(tasks, key=lambda item: (-_late_days(item), _clean_task_title(item.title)))
    return [_task_line_with_late_days(task, names) for task in ordered]


def _clean_task_title(value: str | None) -> str:
    cleaned = TECHNICAL_BLOCK.sub("", value or "")
    cleaned = TECHNICAL_TAG.sub("", cleaned)
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
    personal_ga_ka = [
        task for task in tasks
        if task.is_personal and _is_open(task) and _task_day(task) == tomorrow and PERSONAL_GA_KA.search(task.title or "")
    ]
    blocked = [task for task in tomorrow_tasks if task.is_bllok]
    bz_tasks = [task for task in tomorrow_tasks if re.search(r"\bBZ\b", task.title or "", re.I)]

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
        fallback_bz=_task_lines(bz_tasks, names),
        fallback_blocked=_task_lines(blocked, names),
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
        {"title": SECTION_TITLES[0], "body": finance_section},
        {"title": SECTION_TITLES[1], "body": std_tickets_section},
        {"title": SECTION_TITLES[2], "body": _normalize_section(section_1)},
        {"title": SECTION_TITLES[3], "body": _normalize_section(_m3_status_table("TODO", today_todo, names))},
        {"title": SECTION_TITLES[4], "body": _empty_aware(_leave_lines(leave_tomorrow, names))},
        {"title": SECTION_TITLES[5], "body": _normalize_section(section_4)},
        {"title": SECTION_TITLES[6], "body": _normalize_section(section_5)},
        {"title": SECTION_TITLES[7], "body": section_6},
        {"title": SECTION_TITLES[8], "body": _normalize_section(_m3_status_table("1H PA SLOT", one_h_no_slot, names))},
        {"title": SECTION_TITLES[9], "body": _normalize_section(_m3_status_table("PERSONAL GA/KA", personal_ga_ka, names))},
    ]
    snapshot = {
        "report_day": report_day.isoformat(),
        "tomorrow": tomorrow.isoformat(),
        "counts": {section["title"]: section["body"].count("\n- ") + (1 if section["body"].startswith("- ") else 0) for section in sections},
    }
    return tomorrow, sections, snapshot


def _task_lines(tasks: list[Task], names: dict[Any, str]) -> list[str]:
    if not tasks:
        return ["(Asnje detyre)"]
    ordered = sorted(tasks, key=lambda task: (names.get(task.assigned_to) or "", task.title or ""))
    return [_task_line(task, names) for task in ordered]


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
    return [f"- {_local_time(meeting.starts_at)}: {meeting.title}" for meeting in sorted(meetings, key=lambda m: m.starts_at or datetime.min)]


def _meeting_group_title(title: str) -> list[str]:
    border = "=" * len(title)
    return [border, title, border]


async def _today_meeting_status_section(db: AsyncSession, meetings: list[Meeting], report_day: date) -> str:
    statuses = (
        await db.execute(
            select(MeetingOccurrenceStatus).where(MeetingOccurrenceStatus.occurrence_date == report_day)
        )
    ).scalars().all()
    status_by_meeting = {row.meeting_id: row.status for row in statuses}
    external = [meeting for meeting in meetings if getattr(meeting, "meeting_type", None) == "external"]
    internal = [meeting for meeting in meetings if getattr(meeting, "meeting_type", None) != "external"]

    def by_status(values: list[Meeting], status_value: str) -> list[Meeting]:
        return [meeting for meeting in values if status_by_meeting.get(meeting.id, "") == status_value]

    return _normalize_section([
        *_meeting_group_title("TAKIMET EXTERNE"),
        "",
        "MBAJTUR:",
        *_meeting_lines(by_status(external, "held")),
        "",
        "ANULUAR:",
        *_meeting_lines(by_status(external, "canceled")),
        "",
        "PA STATUS:",
        *_meeting_lines(by_status(external, "")),
        "",
        *_meeting_group_title("TAKIMET INTERNE"),
        "",
        "MBAJTUR:",
        *_meeting_lines(by_status(internal, "held")),
        "",
        "ANULUAR:",
        *_meeting_lines(by_status(internal, "canceled")),
        "",
        "PA STATUS:",
        *_meeting_lines(by_status(internal, "")),
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
    return _initials(str(item.get("person") or item.get("owner") or item.get("employee") or item.get("assignee_name") or ""))


def _common_task_lines(items: list[dict[str, Any]], day: date) -> list[str]:
    lines = []
    seen = set()
    for item in items:
        if _item_date(item) != day:
            continue
        title = _common_title(item)
        key = (item.get("id"), title, _common_owner(item))
        if key in seen:
            continue
        seen.add(key)
        lines.append(f"- {_common_owner(item)}: {title}")
    return lines


def _common_meeting_lines(items: list[dict[str, Any]], day: date) -> list[str]:
    lines = []
    seen = set()
    for item in items:
        if _item_date(item) != day:
            continue
        title = str(item.get("title") or item.get("task_title") or "Meeting").strip()
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


def _tomorrow_common_section(
    *,
    common_items: dict[str, list[dict[str, Any]]],
    tomorrow: date,
    fallback_external: list[str],
    fallback_internal: list[str],
    fallback_bz: list[str],
    fallback_blocked: list[str],
) -> list[str]:
    external = _prefer_common(_common_meeting_lines(common_items.get("external") or [], tomorrow), fallback_external)
    internal = _prefer_common(_common_meeting_lines(common_items.get("internal") or [], tomorrow), fallback_internal)
    bz = _prefer_common(_common_task_lines(common_items.get("bz") or [], tomorrow), fallback_bz)
    blocked = _prefer_common(_common_task_lines(common_items.get("blocked") or [], tomorrow), fallback_blocked)
    return [
        "TAKIMET EXTERNE:",
        *(external or ["(Asnje takim)"]),
        "",
        "TAKIMET INTERNE:",
        *(internal or ["(Asnje takim)"]),
        "",
        "BZ ME GA:",
        *(bz or ["(Asnje detyre)"]),
        "",
        "BLLOK:",
        *(blocked or ["(Asnje detyre)"]),
    ]


def _leave_lines(entries: list[tuple[CommonEntry, bool, str | None, str | None, str | None, bool]], names: dict[Any, str]) -> list[str]:
    if not entries:
        return []
    lines = []
    for entry, full_day, start_time, end_time, note, is_all_users in entries:
        person = "ALL" if is_all_users else _initials(names.get(entry.assigned_to_user_id or entry.created_by_user_id) or entry.title)
        when = "Full day" if full_day else f"{start_time or '-'}-{end_time or '-'}"
        detail = f" - {note}" if note else ""
        lines.append(f"- {person}: {when}{detail}")
    return lines


def _normalize_section(lines: list[str]) -> str:
    return "\n".join(lines).replace("\n\n\n", "\n\n").strip()


def render_plain_text(subject: str, report_day: date, tomorrow: date, sections: list[dict[str, str]]) -> str:
    blocks = [subject, f"Sot: {report_day:%d.%m.%Y}", f"Neser: {tomorrow:%d.%m.%Y}", ""]
    for index, section in enumerate(sections, 1):
        blocks.append(f"{index}. {section['title']}\n{section.get('body') or ''}".strip())
    return "\n\n".join(blocks)


def _parse_ascii_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _render_ascii_table_html(lines: list[str]) -> str:
    table_rows = [_parse_ascii_cells(line) for line in lines if line.startswith("|")]
    if not table_rows:
        return ""
    header, body_rows = table_rows[0], table_rows[1:]
    header_html = "".join(f"<th>{html.escape(cell)}</th>" for cell in header)
    body_html = "".join(
        "<tr>" + "".join(f"<td>{html.escape(cell)}</td>" for cell in row) + "</tr>"
        for row in body_rows
    )
    return f"<table class=\"report-table\"><thead><tr>{header_html}</tr></thead><tbody>{body_html}</tbody></table>"


def _render_section_body_html(body: str) -> str:
    lines = body.splitlines()
    chunks: list[str] = []
    text_buffer: list[str] = []
    index = 0

    def flush_text() -> None:
        if text_buffer:
            chunks.append(f"<pre>{html.escape(chr(10).join(text_buffer).strip())}</pre>")
            text_buffer.clear()

    while index < len(lines):
        line = lines[index]
        if line.startswith("+-") and index + 1 < len(lines) and lines[index + 1].startswith("|"):
            flush_text()
            table_lines: list[str] = []
            while index < len(lines) and (lines[index].startswith("+-") or lines[index].startswith("|")):
                table_lines.append(lines[index])
                index += 1
            chunks.append(_render_ascii_table_html(table_lines))
            continue
        text_buffer.append(line)
        index += 1
    flush_text()
    return "".join(chunk for chunk in chunks if chunk)


def render_html(subject: str, report_day: date, tomorrow: date, sections: list[dict[str, str]]) -> str:
    section_html = "".join(
        "<section>"
        f"<h2>{index}. {html.escape(section['title'])}</h2>"
        f"{_render_section_body_html(section.get('body') or '')}"
        "</section>"
        for index, section in enumerate(sections, 1)
    )
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
body{{font-family:Arial,sans-serif;color:#111827;background:#f8fafc;margin:0;padding:24px}}
.wrap{{max-width:980px;margin:0 auto;background:white;border:1px solid #e5e7eb;padding:24px}}
h1{{font-size:22px;margin:0 0 8px}}p{{margin:0 0 18px;color:#475569}}
h2{{font-size:14px;margin:22px 0 8px;color:#0f172a}}
pre{{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:13px;line-height:1.45;background:#f8fafc;border:1px solid #e5e7eb;padding:12px;margin:0}}
.report-table{{width:100%;border-collapse:collapse;margin:8px 0 12px;font-size:13px}}
.report-table th{{background:#e5e7eb;color:#111827;text-align:left;font-weight:700}}
.report-table th,.report-table td{{border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top}}
.report-table td{{background:#f8fafc}}
</style></head><body><div class="wrap"><h1>{html.escape(subject)}</h1>
<p>Sot: {report_day:%d.%m.%Y} &nbsp; Neser: {tomorrow:%d.%m.%Y}</p>{section_html}</div></body></html>"""


async def send_meetings_report(subject: str, recipients: dict[str, list[str]], plain_text: str, html_body: str) -> dict[str, Any]:
    gmail = GmailService()
    return await gmail.send_verified(subject, recipients, plain_text, html_body, attachments=[])
