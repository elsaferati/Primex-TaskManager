from __future__ import annotations

import re
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common_entry import CommonEntry
from app.models.enums import CommonCategory
from app.models.meeting import Meeting
from app.models.task import Task
from app.models.task_user_comment import TaskUserComment
from app.models.user import User
from app.services.after_break_report import (
    _ascii_table,
    _belongs_to_day,
    _blue_note_rows,
    _display_title,
    _personal_section,
    render_html as _render_html,
    render_plain_text as _render_plain_text,
)
from app.services.common_leave import parse_common_view_annual_leave
from app.services.meetings_report import (
    PERSONAL_GA_KA,
    _assignee_names,
    _bz_alignment_lines,
    _effective_task_assignee_ids,
    _initials,
    _is_open,
    _leave_lines,
    _local_date,
    _local_time,
    _meeting_lines,
    _meeting_occurs_on_date,
    _normalize_section,
    _task_lines,
    _tomorrow_meeting_table,
    _tomorrow_task_table,
    _users_by_initials,
    send_meetings_report,
)

REPORT_TYPE = "morning_report"
REPORT_LABEL = "Hapja e dites M1"
SECTION_TITLES = [
    "(GA) VONESA/MUNGESA. A NDRYSHON PLANI PER SOT?",
    (
        "(GA) NOTES TE REJA?- SELEKTO NOTES TE KALTRA DHE DISKUTO (ADM & DSG) SECILEN A KRIJOHET "
        "DETYRE? EM: INFO PX (KO SPAM), EM:INFO HF, (KO SPAM) EM: PRIMEX EU (GMAIL-KO SPAM), "
        "VENDOS DET: STATUS (1H: EM(08:00),08:00,DL,AM,AM&PM,PM/P/R1)"
    ),
    "(GA) A KA REPLY NGA GA TEK DETYRAT NGA STAFI PER GA?",
    "PV/FESTA EXTERNE/TAKIMET EXTERNE/ TAKIME INTERNE/ BZ ME GA/BLLOK:",
    "(GA/KA) KUSH KA DET PERSONALISHT?",
]


def subject_for(day: date) -> str:
    return f"PrimeFlow Hapja e dites M1 - {day:%d.%m.%Y}"


def _default_body(title: str) -> str:
    if title == SECTION_TITLES[0]:
        return "\n".join(["VONESA: 0", "", "MUNGESA: 0", "", "NDRYSHON PLANI: (Ploteso manualisht)"])
    if title == SECTION_TITLES[1]:
        return "\n".join(
            [
                "NOTES: 0",
                "",
                "EMAIL INFO PX (KO SPAM): (Ploteso manualisht)",
                "EMAIL INFO HF (KO SPAM): (Ploteso manualisht)",
                "EMAIL PRIMEX EU / GMAIL (KO SPAM): (Ploteso manualisht)",
                "STATUSI I DETYRAVE: (Ploteso manualisht)",
            ]
        )
    if title == SECTION_TITLES[2]:
        return "GA REPLIES: 0"
    if title == SECTION_TITLES[3]:
        return "\n\n".join(
            [
                "PV: 0",
                "FESTA EXTERNE: 0",
                "TAKIMET EXTERNE: 0",
                "TAKIMET INTERNE: 0",
                "BZ ME GA: 0",
                "BLLOK: 0",
            ]
        )
    return "\n\n".join(["TODO: 0", "IN PROGRESS: 0", "WAITING CONFIRMATION: 0", "DONE: 0"])


def normalize_morning_report_sections(sections: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    by_title: dict[str, str] = {}
    extras: list[dict[str, str]] = []
    for section in sections or []:
        title = str(section.get("title") or "").strip()
        body = str(section.get("body") or "")
        if title in SECTION_TITLES and title not in by_title:
            by_title[title] = body
        elif title:
            extras.append({"title": title, "body": body})

    normalized = [
        {"title": title, "body": by_title.get(title, _default_body(title))}
        for title in SECTION_TITLES
    ]
    normalized.extend(extras)
    return normalized


def _entry_day(entry: CommonEntry) -> date | None:
    if entry.entry_date:
        return entry.entry_date
    description = entry.description or ""
    match = re.search(r"Date:\s*(\d{4}-\d{2}-\d{2})", description, re.I)
    if match:
        try:
            return date.fromisoformat(match.group(1))
        except ValueError:
            pass
    return _local_date(entry.created_at)


def _entry_person(entry: CommonEntry, names: dict[Any, str]) -> str:
    user_id = entry.assigned_to_user_id or entry.created_by_user_id
    return _initials(names.get(user_id) or entry.title)


def _clean_entry_note(value: str | None) -> str:
    note = value or ""
    note = re.sub(r"Date:\s*\d{4}-\d{2}-\d{2}", "", note, flags=re.I)
    note = re.sub(r"Start:\s*\d{1,2}:\d{2}", "", note, flags=re.I)
    note = re.sub(r"Until:\s*\d{1,2}:\d{2}", "", note, flags=re.I)
    note = re.sub(r"From:\s*\d{1,2}:\d{2}\s*-\s*To:\s*\d{1,2}:\d{2}", "", note, flags=re.I)
    return re.sub(r"\s+", " ", note).strip() or "-"


def _attendance_section(entries: list[CommonEntry], names: dict[Any, str], report_day: date) -> str:
    delay_rows: list[list[str]] = []
    absence_rows: list[list[str]] = []
    for entry in entries:
        if _entry_day(entry) != report_day:
            continue
        description = entry.description or ""
        if entry.category == CommonCategory.delays:
            start_match = re.search(r"Start:\s*(\d{1,2}:\d{2})", description, re.I)
            until_match = re.search(r"Until:\s*(\d{1,2}:\d{2})", description, re.I)
            start = start_match.group(1) if start_match else "08:00"
            until = until_match.group(1) if until_match else "09:00"
            delay_rows.append(
                [str(len(delay_rows) + 1), _entry_person(entry, names), f"{start}-{until}", _clean_entry_note(description)]
            )
        elif entry.category == CommonCategory.absences:
            times = re.search(
                r"From:\s*(\d{1,2}:\d{2})\s*-\s*To:\s*(\d{1,2}:\d{2})", description, re.I
            )
            when = f"{times.group(1)}-{times.group(2)}" if times else "08:00-23:00"
            absence_rows.append(
                [str(len(absence_rows) + 1), _entry_person(entry, names), when, _clean_entry_note(description)]
            )

    return _normalize_section(
        [
            *_ascii_table("VONESA", [("NR", 2), ("WHO", 10), ("TIME", 11), ("NOTE", 48)], delay_rows),
            "",
            *_ascii_table("MUNGESA", [("NR", 2), ("WHO", 10), ("TIME", 11), ("NOTE", 48)], absence_rows),
            "",
            "NDRYSHON PLANI: (Ploteso manualisht)",
        ]
    )


def _notes_section(note_rows: list[list[str]]) -> str:
    return _normalize_section(
        [
            *_ascii_table(
                "NOTES",
                [("NR", 2), ("DISK", 4), ("NOTE", 60), ("FROM", 8), ("TIME", 5)],
                note_rows,
            ),
            "",
            "EMAIL INFO PX (KO SPAM): (Ploteso manualisht)",
            "EMAIL INFO HF (KO SPAM): (Ploteso manualisht)",
            "EMAIL PRIMEX EU / GMAIL (KO SPAM): (Ploteso manualisht)",
            "STATUSI I DETYRAVE 1H/08:00/DL/AM/AM&PM/PM/P/R1: (Ploteso manualisht)",
        ]
    )


async def _ga_reply_section(db: AsyncSession, tasks: list[Task], report_day: date) -> tuple[str, int]:
    ga_users = await _users_by_initials(db, "GA")
    ga_ids = {user.id for user in ga_users}
    if not ga_ids:
        return "GA REPLIES: 0", 0

    comments = (
        await db.execute(
            select(TaskUserComment)
            .where(TaskUserComment.user_id.in_(ga_ids))
            .where(TaskUserComment.comment.is_not(None))
        )
    ).scalars().all()
    task_by_id = {task.id: task for task in tasks}
    rows: list[tuple[TaskUserComment, Task]] = []
    creator_ids: set[Any] = set()
    for comment in comments:
        task = task_by_id.get(comment.task_id)
        if task is None or not (comment.comment or "").strip():
            continue
        if _local_date(comment.updated_at or comment.created_at) != report_day:
            continue
        if task.created_by in ga_ids:
            continue
        rows.append((comment, task))
        if task.created_by:
            creator_ids.add(task.created_by)

    creator_names: dict[Any, str] = {}
    if creator_ids:
        users = (await db.execute(select(User).where(User.id.in_(creator_ids)))).scalars().all()
        creator_names = {user.id: user.full_name or user.username or user.email for user in users}

    values = [
        [
            str(index),
            _initials(creator_names.get(task.created_by)),
            _display_title(task.title),
            re.sub(r"\s+", " ", comment.comment or "").strip(),
            _local_time(comment.updated_at or comment.created_at),
        ]
        for index, (comment, task) in enumerate(
            sorted(rows, key=lambda item: item[0].updated_at or item[0].created_at), start=1
        )
    ]
    return _normalize_section(
        _ascii_table(
            "GA REPLIES",
            [("NR", 2), ("FROM", 8), ("TITLE", 42), ("REPLY", 50), ("TIME", 5)],
            values,
        )
    ), len(values)


async def _day_context_section(
    db: AsyncSession,
    entries: list[CommonEntry],
    names: dict[Any, str],
    tasks: list[Task],
    assignee_ids_by_task: dict[Any, set[Any]],
    report_day: date,
) -> tuple[str, int]:
    leave_rows = []
    holiday_rows: list[list[str]] = []
    common_block_lines: list[str] = []
    for entry in entries:
        if entry.category == CommonCategory.annual_leave:
            start, end, full_day, start_time, end_time, note, is_all_users = parse_common_view_annual_leave(entry)
            if start <= report_day <= end:
                leave_rows.append((entry, full_day, start_time, end_time, note, is_all_users))
        elif entry.category == CommonCategory.external_holiday and _entry_day(entry) == report_day:
            holiday_rows.append([str(len(holiday_rows) + 1), entry.title, _clean_entry_note(entry.description)])
        elif entry.category == CommonCategory.blocks and _entry_day(entry) == report_day:
            common_block_lines.append(f"- {_entry_person(entry, names)}: {_display_title(entry.title)}")

    meetings = (await db.execute(select(Meeting).where(Meeting.starts_at.is_not(None)))).scalars().all()
    today_meetings = [meeting for meeting in meetings if _meeting_occurs_on_date(meeting, report_day)]
    external_meetings = [meeting for meeting in today_meetings if meeting.meeting_type == "external"]
    internal_meetings = [meeting for meeting in today_meetings if meeting.meeting_type != "external"]

    today_tasks = [task for task in tasks if _belongs_to_day(task, report_day) and _is_open(task)]
    bz_tasks = [task for task in today_tasks if re.search(r"\bBZ\b", task.title or "", re.I)]
    blocked_tasks = [task for task in today_tasks if task.is_bllok]
    bz_lines = await _bz_alignment_lines(db, report_day, tasks, names, assignee_ids_by_task)
    bz_lines = bz_lines or _task_lines(bz_tasks, names, assignee_ids_by_task)
    block_lines = [*common_block_lines, *_task_lines(blocked_tasks, names, assignee_ids_by_task)]
    bz_lines = list(dict.fromkeys(line for line in bz_lines if line and not line.startswith("(")))
    block_lines = list(dict.fromkeys(line for line in block_lines if line and not line.startswith("(")))

    lines = [
        "PV",
        *_leave_lines(leave_rows, names),
        "",
        *_ascii_table("FESTA EXTERNE", [("NR", 2), ("FESTA", 48), ("NOTE", 32)], holiday_rows),
        "",
        *_tomorrow_meeting_table("TAKIMET EXTERNE", _meeting_lines(external_meetings)),
        "",
        *_tomorrow_meeting_table("TAKIMET INTERNE", _meeting_lines(internal_meetings)),
        "",
        *_tomorrow_task_table("BZ ME GA", bz_lines),
        "",
        *_tomorrow_task_table("BLLOK", block_lines),
    ]
    count = len(leave_rows) + len(holiday_rows) + len(today_meetings) + len(bz_lines) + len(block_lines)
    return _normalize_section(lines), count


async def build_morning_report_sections(
    db: AsyncSession, report_day: date
) -> tuple[list[dict[str, str]], dict[str, Any]]:
    tasks = (await db.execute(select(Task).where(Task.is_active.is_(True)))).scalars().all()
    report_categories = [
        CommonCategory.delays,
        CommonCategory.absences,
        CommonCategory.annual_leave,
        CommonCategory.external_holiday,
        CommonCategory.blocks,
    ]
    entries = (
        await db.execute(select(CommonEntry).where(CommonEntry.category.in_(report_categories)))
    ).scalars().all()
    names = await _assignee_names(db, tasks)
    assignee_ids_by_task = await _effective_task_assignee_ids(db, tasks)

    entry_user_ids = {
        user_id
        for entry in entries
        for user_id in (entry.assigned_to_user_id, entry.created_by_user_id)
        if user_id and user_id not in names
    }
    if entry_user_ids:
        users = (await db.execute(select(User).where(User.id.in_(entry_user_ids)))).scalars().all()
        names.update({user.id: user.full_name or user.username or user.email for user in users})

    note_rows = await _blue_note_rows(db, report_day)
    ga_replies, ga_reply_count = await _ga_reply_section(db, tasks, report_day)
    day_context, day_context_count = await _day_context_section(
        db, entries, names, tasks, assignee_ids_by_task, report_day
    )
    personal = await _personal_section(
        db, tasks, names, assignee_ids_by_task, report_day, title_pattern=PERSONAL_GA_KA
    )

    attendance = _attendance_section(entries, names, report_day)
    sections = [
        {"title": SECTION_TITLES[0], "body": attendance},
        {"title": SECTION_TITLES[1], "body": _notes_section(note_rows)},
        {"title": SECTION_TITLES[2], "body": ga_replies},
        {"title": SECTION_TITLES[3], "body": day_context},
        {"title": SECTION_TITLES[4], "body": _normalize_section(personal)},
    ]
    snapshot = {
        "report_day": report_day.isoformat(),
        "counts": {
            SECTION_TITLES[0]: sum(
                1
                for entry in entries
                if entry.category in {CommonCategory.delays, CommonCategory.absences}
                and _entry_day(entry) == report_day
            ),
            SECTION_TITLES[1]: len(note_rows),
            SECTION_TITLES[2]: ga_reply_count,
            SECTION_TITLES[3]: day_context_count,
            SECTION_TITLES[4]: sum(1 for line in personal if re.match(r"^\|\s+\d+\s+\|", line)),
        },
    }
    return sections, snapshot


def render_plain_text(subject: str, report_day: date, sections: list[dict[str, str]]) -> str:
    return _render_plain_text(subject, report_day, sections)


def render_html(subject: str, report_day: date, sections: list[dict[str, str]]) -> str:
    return _render_html(subject, report_day, sections)


async def send_morning_report(
    subject: str, recipients: dict[str, list[str]], plain_text: str, html_body: str
) -> dict[str, Any]:
    return await send_meetings_report(subject, recipients, plain_text, html_body)
