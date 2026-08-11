from __future__ import annotations

import re
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common_entry import CommonEntry
from app.models.department import Department
from app.models.enums import CommonCategory
from app.models.meeting import Meeting
from app.models.task import Task
from app.models.user import User
from app.services.after_break_report import (
    _ascii_table,
    _belongs_to_day,
    _blue_note_rows,
    _display_title,
    _personal_section,
)
from app.services.common_leave import parse_common_view_annual_leave
from app.services.meetings_report import (
    PERSONAL_GA,
    TECHNICAL_TAG,
    _all_participant_user_ids,
    _assignee_names,
    apply_weekly_planner_task_order,
    _bz_alignment_lines,
    _effective_task_assignee_ids,
    _initials,
    _is_open,
    _leave_lines,
    _local_date,
    _meeting_lines,
    _meeting_occurs_on_date,
    _normalize_section,
    _strip_status_markers,
    _task_lines,
    _task_metadata_by_title,
    _tomorrow_meeting_table,
    _tomorrow_task_table,
    weekly_planner_user_sort_keys,
    send_section_report,
)

REPORT_TYPE = "morning_report"
REPORT_LABEL = "Hapja e dites M1"
SECTION_TITLES = [
    # Manual answer first
    "(GA) A KA REPLY NGA GA TEK DETYRAT NGA STAFI PER GA?",
    # Auto-filled from PrimeFlow
    "(GA) DET NGA EMAILS TE REJA",
    "(GA) VONESA/MUNGESA. A NDRYSHON PLANI PER SOT?",
    "(GA) NOTES TE REJA?",
    "PV/FESTA EXTERNE/TAKIMET EXTERNE/ TAKIME INTERNE/ BZ ME GA/BLLOK:",
    "(GA/KA) KUSH KA DET PERSONALISHT?",
]
MANUAL_SECTION_TITLES = {SECTION_TITLES[0]}
EMAIL_TASK_SOURCES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("EM: INFO PX", re.compile(r"^\s*EM\s*:\s*INFO\s+PX\b", re.I)),
    ("EM: IT", re.compile(r"^\s*EM\s*:\s*IT\b", re.I)),
    ("EM: HF", re.compile(r"^\s*EM\s*:\s*HF\b", re.I)),
    ("EM: PX EU", re.compile(r"^\s*EM\s*:\s*PX\s+EU\b", re.I)),
)
LEGACY_NOTES_TITLE = (
    "(GA) NOTES TE REJA?- SELEKTO NOTES TE KALTRA DHE DISKUTO (ADM & DSG) SECILEN A KRIJOHET "
    "DETYRE? EM: INFO PX (KO SPAM), EM:INFO HF, (KO SPAM) EM: PRIMEX EU (GMAIL-KO SPAM), "
    "VENDOS DET: STATUS (1H: EM(08:00),08:00,DL,AM,AM&PM,PM/P/R1)"
)
SECTION_TITLE_ALIASES = {
    "(GA) NOTES TE REJA?- SELEKTO NOTES TE KALTRA DHE DISKUTO (ADM & DSG) SECILEN A KRIJOHET DETYRE?": SECTION_TITLES[3],
    LEGACY_NOTES_TITLE: SECTION_TITLES[3],
}


def subject_for(day: date) -> str:
    return f"M1 - PrimeFlow Hapja e dites - {day:%d.%m.%Y}"


def is_generated_subject(subject: str | None, day: date) -> bool:
    """Recognize the old and current automatically generated M1 subjects."""
    return (subject or "").strip() in {
        subject_for(day),
        f"PrimeFlow Hapja e dites M1 - {day:%d.%m.%Y}",
    }


def _emails_default_body() -> str:
    return "Email-source tasks load automatically when M1 is generated."


def _default_body(title: str) -> str:
    if title == SECTION_TITLES[0]:
        return "(Ploteso manualisht)"
    if title == SECTION_TITLES[1]:
        return _emails_default_body()
    if title == SECTION_TITLES[2]:
        return "\n".join(["VONESA: 0", "", "MUNGESA: 0", "", "NDRYSHON PLANI: (Ploteso manualisht)"])
    if title == SECTION_TITLES[3]:
        return "NOTES: 0"
    if title == SECTION_TITLES[4]:
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


def _is_manual_email_line(line: str) -> bool:
    upper = line.strip().upper()
    return upper.startswith("EMAIL ") or upper.startswith("STATUSI I DETYRAVE")


def _without_retired_task_status_prompt(body: str) -> str:
    """Remove the retired task-status prompt from saved M1 email sections."""
    return "\n".join(
        line for line in (body or "").splitlines()
        if not line.strip().upper().startswith("STATUSI I DETYRAVE")
    ).strip()


def _split_notes_and_emails(body: str) -> tuple[str, str]:
    note_lines: list[str] = []
    email_lines: list[str] = []
    for line in (body or "").splitlines():
        if _is_manual_email_line(line):
            email_lines.append(line.strip())
        else:
            note_lines.append(line)
    notes_body = "\n".join(note_lines).strip() or "NOTES: 0"
    emails_body = _without_retired_task_status_prompt("\n\n".join(line for line in email_lines if line))
    emails_body = emails_body or _emails_default_body()
    return notes_body, emails_body


def _separate_keyed_prompt_lines(body: str) -> str:
    """Keep one blank line between uppercase KEY: value prompts for readability."""
    parts = [line.strip() for line in (body or "").splitlines() if line.strip()]
    return "\n\n".join(parts) if parts else body


def _compact_section_title(title: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "", (title or "").upper())


def _canonical_section_title(raw_title: str) -> str | None:
    title = SECTION_TITLE_ALIASES.get(raw_title, raw_title).strip()
    if title in SECTION_TITLES:
        return title

    compact = _compact_section_title(title)
    for known in SECTION_TITLES:
        if _compact_section_title(known) == compact:
            return known

    # Older drafts used near-identical wording for the emails / notes prompts.
    if "VENDOSDETSTATUS" in compact or compact.startswith("GAEMINFO"):
        return SECTION_TITLES[1]
    if "NOTESTEREJA" in compact and "VENDOSDETSTATUS" not in compact:
        return SECTION_TITLES[3]
    if "AKAREPLYNGAGA" in compact:
        return SECTION_TITLES[0]
    if "VONESA" in compact and "MUNGESA" in compact:
        return SECTION_TITLES[2]
    if "BZMEGA" in compact and "BLLOK" in compact:
        return SECTION_TITLES[4]
    if "KUSHKADETPERSONALISHT" in compact:
        return SECTION_TITLES[5]
    return None


def normalize_morning_report_sections(sections: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    by_title: dict[str, str] = {}
    extras: list[dict[str, str]] = []
    for section in sections or []:
        raw_title = str(section.get("title") or "").strip()
        title = _canonical_section_title(raw_title)
        body = str(section.get("body") or "")
        if raw_title == LEGACY_NOTES_TITLE or (
            title == SECTION_TITLES[3] and any(_is_manual_email_line(line) for line in body.splitlines())
        ):
            notes_body, emails_body = _split_notes_and_emails(body)
            if SECTION_TITLES[3] not in by_title:
                by_title[SECTION_TITLES[3]] = notes_body
            if SECTION_TITLES[1] not in by_title:
                by_title[SECTION_TITLES[1]] = emails_body
            continue
        if title is None:
            if raw_title:
                extras.append({"title": raw_title, "body": body})
            continue
        if title == SECTION_TITLES[1]:
            body = _separate_keyed_prompt_lines(_without_retired_task_status_prompt(body)) or _emails_default_body()
        if title not in by_title:
            by_title[title] = body

    # Keep Common View–synced manuals after built-in manuals and before auto sections.
    known = [
        {"title": title, "body": by_title.get(title, _default_body(title))}
        for title in SECTION_TITLES
    ]
    if not extras:
        return known
    insert_at = max(
        (index + 1 for index, section in enumerate(known) if section["title"] in MANUAL_SECTION_TITLES),
        default=0,
    )
    return known[:insert_at] + extras + known[insert_at:]


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
    note = TECHNICAL_TAG.sub("", value or "")
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
        _ascii_table(
            "NOTES",
            [("NR", 2), ("DISK", 4), ("NOTE", 60), ("FROM", 8), ("TIME", 5)],
            note_rows,
        )
    )


def _email_task_source_label(task: Task) -> str | None:
    """Return the standard email-source tag at the beginning of a task title."""
    title = task.title or ""
    return next((label for label, pattern in EMAIL_TASK_SOURCES if pattern.search(title)), None)


def _emails_section(
    tasks: list[Task],
    names: dict[Any, str],
    assignee_ids_by_task: dict[Any, set[Any]],
    department_codes: dict[Any, str],
    all_participant_ids: set[Any],
) -> tuple[str, int]:
    """Render open email-source tasks in one table per standard source tag."""
    lines: list[str] = []
    count = 0
    for label, _ in EMAIL_TASK_SOURCES:
        source_tasks = [
            task
            for task in tasks
            if _is_open(task) and _email_task_source_label(task) == label
        ]
        count += len(source_tasks)
        lines.extend(
            _tomorrow_task_table(
                f"{label}: {len(source_tasks)}",
                _task_lines(
                    source_tasks,
                    names,
                    assignee_ids_by_task,
                    include_status=True,
                    all_participant_ids=all_participant_ids,
                ),
                with_status=True,
                task_metadata=_task_metadata_by_title(source_tasks, department_codes),
                include_am_pm_times=True,
            )
        )
        lines.append("")
    return _normalize_section(lines), count


async def _day_context_section(
    db: AsyncSession,
    entries: list[CommonEntry],
    names: dict[Any, str],
    tasks: list[Task],
    assignee_ids_by_task: dict[Any, set[Any]],
    report_day: date,
    user_department_codes: dict[Any, str] | None = None,
    user_sort_keys: dict[Any, tuple[int, str, int, int, str]] | None = None,
) -> tuple[str, int]:
    leave_rows = []
    holiday_rows: list[list[str]] = []
    common_block_lines: list[str] = []
    for entry in entries:
        if entry.category == CommonCategory.annual_leave:
            start, end, full_day, start_time, end_time, note, is_all_users = parse_common_view_annual_leave(entry)
            if start <= report_day <= end:
                # _leave_lines is shared with M3 and expects the complete
                # annual-leave tuple, including the start and end dates.
                leave_rows.append((entry, start, end, full_day, start_time, end_time, note, is_all_users))
        elif entry.category == CommonCategory.external_holiday and _entry_day(entry) == report_day:
            holiday_rows.append(
                [str(len(holiday_rows) + 1), _display_title(entry.title), _clean_entry_note(entry.description)]
            )
        elif entry.category == CommonCategory.blocks and _entry_day(entry) == report_day:
            common_block_lines.append(f"- {_entry_person(entry, names)}: {_display_title(entry.title)}")

    meetings = (await db.execute(select(Meeting).where(Meeting.starts_at.is_not(None)))).scalars().all()
    today_meetings = [meeting for meeting in meetings if _meeting_occurs_on_date(meeting, report_day)]
    external_meetings = [meeting for meeting in today_meetings if meeting.meeting_type == "external"]
    internal_meetings = [meeting for meeting in today_meetings if meeting.meeting_type != "external"]

    today_tasks = [task for task in tasks if _belongs_to_day(task, report_day) and _is_open(task)]
    bz_tasks = [task for task in today_tasks if re.search(r"\bBZ\b", task.title or "", re.I)]
    blocked_tasks = [task for task in today_tasks if task.is_bllok]
    all_participant_ids = await _all_participant_user_ids(db)
    bz_lines = await _bz_alignment_lines(
        db, report_day, tasks, names, assignee_ids_by_task, include_status=True
    )
    bz_lines = bz_lines or _task_lines(
        bz_tasks,
        names,
        assignee_ids_by_task,
        include_status=True,
        all_participant_ids=all_participant_ids,
    )
    block_lines = [
        *common_block_lines,
        *_task_lines(
            blocked_tasks,
            names,
            assignee_ids_by_task,
            include_status=True,
            all_participant_ids=all_participant_ids,
        ),
    ]
    bz_lines = list(dict.fromkeys(line for line in bz_lines if line and not line.startswith("(")))
    block_lines = list(dict.fromkeys(line for line in block_lines if line and not line.startswith("(")))
    department_codes = {
        department_id: code
        for department_id, code in (await db.execute(select(Department.id, Department.code))).all()
    }

    lines = [
        "PV",
        *_leave_lines(leave_rows, names, user_department_codes, user_sort_keys),
        "",
        *_ascii_table("FESTA EXTERNE", [("NR", 2), ("FESTA", 48), ("NOTE", 32)], holiday_rows),
        "",
        *_tomorrow_meeting_table("TAKIMET EXTERNE", _meeting_lines(external_meetings)),
        "",
        *_tomorrow_meeting_table("TAKIMET INTERNE", _meeting_lines(internal_meetings)),
        "",
        *_tomorrow_task_table(
            "BZ ME GA",
            bz_lines,
            with_status=True,
            task_metadata=_task_metadata_by_title(today_tasks, department_codes),
            include_am_pm_times=True,
        ),
        "",
        *_tomorrow_task_table(
            "BLLOK",
            block_lines,
            with_status=True,
            task_metadata=_task_metadata_by_title(blocked_tasks, department_codes),
        ),
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
    await apply_weekly_planner_task_order(db, tasks, assignee_ids_by_task)

    entry_user_ids = {
        user_id
        for entry in entries
        for user_id in (entry.assigned_to_user_id, entry.created_by_user_id)
        if user_id and user_id not in names
    }
    if entry_user_ids:
        users = (await db.execute(select(User).where(User.id.in_(entry_user_ids)))).scalars().all()
        names.update({user.id: user.full_name or user.username or user.email for user in users})

    department_codes = {
        department_id: code
        for department_id, code in (await db.execute(select(Department.id, Department.code))).all()
    }
    user_department_codes = {
        user_id: department_codes.get(department_id, "-") or "-"
        for user_id, department_id in (await db.execute(select(User.id, User.department_id))).all()
    }
    leave_user_ids = {
        entry.assigned_to_user_id or entry.created_by_user_id
        for entry in entries
        if entry.category == CommonCategory.annual_leave
        and (entry.assigned_to_user_id or entry.created_by_user_id)
    }
    leave_user_sort_keys = await weekly_planner_user_sort_keys(db, leave_user_ids, department_codes)

    note_rows = await _blue_note_rows(db)
    all_participant_ids = await _all_participant_user_ids(db)
    email_tasks, email_task_count = _emails_section(
        tasks,
        names,
        assignee_ids_by_task,
        department_codes,
        all_participant_ids,
    )
    day_context, day_context_count = await _day_context_section(
        db,
        entries,
        names,
        tasks,
        assignee_ids_by_task,
        report_day,
        user_department_codes,
        leave_user_sort_keys,
    )
    personal = await _personal_section(
        db,
        tasks,
        names,
        assignee_ids_by_task,
        report_day,
        title_pattern=PERSONAL_GA,
        department_codes=department_codes,
    )

    attendance = _attendance_section(entries, names, report_day)
    sections = [
        {"title": SECTION_TITLES[0], "body": "(Ploteso manualisht)"},
        {"title": SECTION_TITLES[1], "body": email_tasks},
        {"title": SECTION_TITLES[2], "body": attendance},
        {"title": SECTION_TITLES[3], "body": _notes_section(note_rows)},
        {"title": SECTION_TITLES[4], "body": day_context},
        {"title": SECTION_TITLES[5], "body": _normalize_section(personal)},
    ]
    snapshot = {
        "report_day": report_day.isoformat(),
        "counts": {
            SECTION_TITLES[0]: 0,
            SECTION_TITLES[1]: email_task_count,
            SECTION_TITLES[2]: sum(
                1
                for entry in entries
                if entry.category in {CommonCategory.delays, CommonCategory.absences}
                and _entry_day(entry) == report_day
            ),
            SECTION_TITLES[3]: len(note_rows),
            SECTION_TITLES[4]: day_context_count,
            SECTION_TITLES[5]: sum(1 for line in personal if re.match(r"^\|\s+\d+\s+\|", line)),
        },
    }
    return sections, snapshot


def render_plain_text(subject: str, report_day: date, sections: list[dict[str, str]]) -> str:
    from app.services.meeting_point_manual_sync import section_group_label

    blocks = [subject, f"Sot: {report_day:%d.%m.%Y}", ""]
    current_group = ""
    for index, section in enumerate(sections, 1):
        group = section_group_label("morning", section["title"])
        if group != current_group:
            blocks.append(group)
            current_group = group
        blocks.append(
            f"{index}. {section['title']}\n{_strip_status_markers(section.get('body') or '')}".strip()
        )
    return "\n\n".join(blocks)


def render_html(subject: str, report_day: date, sections: list[dict[str, str]]) -> str:
    from app.services.meeting_point_manual_sync import section_group_label
    from app.services.meetings_report import (
        _render_group_label_html,
        _render_section_block_html,
        _wrap_report_email_html,
    )

    section_chunks: list[str] = []
    current_group = ""
    for index, section in enumerate(sections, 1):
        group = section_group_label("morning", section["title"])
        if group != current_group:
            section_chunks.append(_render_group_label_html(group))
            current_group = group
        section_chunks.append(
            _render_section_block_html(index, section["title"], section.get("body") or "")
        )
    return _wrap_report_email_html(
        subject,
        f"Sot: {report_day:%d.%m.%Y}",
        "".join(section_chunks),
    )


async def send_morning_report(
    subject: str,
    recipients: dict[str, list[str]],
    plain_text: str,
    html_body: str,
    *,
    report_day: date,
    sections: list[dict[str, str]],
) -> dict[str, Any]:
    return await send_section_report(
        subject, recipients, plain_text, html_body,
        report_code="M1", report_day=report_day, sections=sections,
    )
