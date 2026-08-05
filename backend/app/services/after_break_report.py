from __future__ import annotations

import html
import re
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import CommonApprovalStatus, GaNoteStatus
from app.models.ga_note import GaNote
from app.models.question_library import QuestionCategory, QuestionDefinition
from app.models.system_task_template import SystemTaskTemplate
from app.models.task import Task
from app.models.user import User
from app.services.meetings_report import (
    DUE_SUFFIX,
    TECHNICAL_TAG,
    TITLE_PREFIX,
    _assignee_names,
    _effective_task_assignee_ids,
    _initials,
    _is_open,
    _local_date,
    _local_time,
    _normalize_section,
    _render_section_body_html,
    _task_owners,
    _wrap_fixed_width,
    send_meetings_report,
)

REPORT_TYPE = "after_break_report"
REPORT_LABEL = "Permbledhja pas pauzes"
SECTION_TITLES = [
    "A KEMI NEW SYSTEM TASKS/ PYETJE PER KONFIRMIM?",
    "(GA/KA) KUSH KA DET PERSONALISHT?",
    "NOTES TE REJA ME TE KALTER DHE DISSCUSED?",
]
# Personal tasks count only when the title marks them as GA's: initials then a slash or a
# colon, e.g. "DM/GA: BZ GA - P/P PARA PF" or "ER:GA DEVICES". "AT/KA:" and "ER/KA:" stay out.
PERSONAL_GA = re.compile(r"[/:]\s*GA\b", re.I)
PERSONAL_COLUMNS = [("NR", 2), ("WHO", 20), ("TITLE", 56)]
PERSONAL_GROUPS = [
    ("TODO", "TODO"),
    ("IN PROGRESS", "IN_PROGRESS"),
    ("WAITING CONFIRMATION", "WAITING_CONFIRMATION"),
    ("DONE", "DONE"),
]


def subject_for(day: date) -> str:
    return f"PrimeFlow Permbledhja pas pauzes - {day:%d.%m.%Y}"


def _ascii_table(label: str, columns: list[tuple[str, int]], rows_values: list[list[str]]) -> list[str]:
    if not rows_values:
        return [f"{label}: 0"]
    border = "+" + "+".join("-" * (width + 2) for _, width in columns) + "+"
    rows = [
        f"{label}:",
        border,
        "| " + " | ".join(f"{name:<{width}}" for name, width in columns) + " |",
        border,
    ]
    for values in rows_values:
        wrapped = [
            _wrap_fixed_width(value, width) if value.strip() else [""]
            for value, (_, width) in zip(values, columns)
        ]
        for position in range(max(len(cell) for cell in wrapped)):
            line_cells = [
                cell[position] if position < len(cell) else ""
                for cell in wrapped
            ]
            rows.append("| " + " | ".join(f"{value:<{width}}" for value, (_, width) in zip(line_cells, columns)) + " |")
        rows.append(border)
    return rows


def _note_text(value: str | None) -> str:
    cleaned = TECHNICAL_TAG.sub("", value or "")
    return re.sub(r"\s+", " ", cleaned).strip() or "-"


def _display_title(value: str | None) -> str:
    """Like meetings_report._clean_task_title, but keeps text added after creation.

    That text is wrapped in [[added]]..[[/added]] and carries the meaningful part of the
    title (e.g. "DM/[[added]] GA: BZ GA - P/P PARA PF[[/added]]"), so only the markers go.
    """
    cleaned = TECHNICAL_TAG.sub("", value or "")
    candidates = [line.strip() for line in cleaned.splitlines() if line.strip()]
    title_line = next((line for line in candidates if TITLE_PREFIX.search(line)), "")
    if not title_line:
        title_line = next((line for line in candidates if not re.match(r"^\d+\.", line)), "")
    title_line = DUE_SUFFIX.sub("", title_line)
    return re.sub(r"\s+", " ", title_line).strip() or "-"


def _task_covers_day(task: Task, day: date) -> bool:
    """Mirror the Common View date logic so the report shows the same rows as the P: lane."""
    single_day_only = str(task.phase or "").upper() in {"CHECK", "CONTROL"}
    start = _local_date(task.start_date)
    due = _local_date(task.due_date)
    if not single_day_only and start and due:
        if start > due:
            start, due = due, start
        if any(current.weekday() < 5 for current in _days_between(start, due)):
            return start <= day <= due and day.weekday() < 5
        return day == start
    source = getattr(task, "planned_for", None) or task.due_date or task.start_date or task.created_at
    return _local_date(source) == day


def _days_between(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _is_done(task: Task) -> bool:
    return bool(task.completed_at) or str(task.status or "").upper() in {"DONE", "COMPLETED"}


def _belongs_to_day(task: Task, day: date) -> bool:
    """Only today's work: a finished task counts on the day it was finished, not for its whole range."""
    if _is_done(task):
        completed = _local_date(task.completed_at)
        if completed is not None:
            return completed == day
    return _task_covers_day(task, day)


async def _new_system_task_rows(db: AsyncSession) -> list[list[str]]:
    templates = (
        await db.execute(
            select(SystemTaskTemplate).where(SystemTaskTemplate.approval_status == CommonApprovalStatus.pending)
        )
    ).scalars().all()
    if not templates:
        return []

    user_ids: set[Any] = set()
    for template in templates:
        user_ids.update(template.assignee_ids or [])
        if template.default_assignee_id:
            user_ids.add(template.default_assignee_id)
    users_map: dict[Any, User] = {}
    if user_ids:
        users = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        users_map = {user.id: user for user in users}

    rows: list[list[str]] = []
    def _created_sort_key(template: SystemTaskTemplate) -> tuple[bool, float, str]:
        created_at = template.created_at
        return (created_at is None, created_at.timestamp() if created_at else 0.0, template.title or "")

    for template in sorted(templates, key=_created_sort_key):
        assignee_ids = list(template.assignee_ids or [])
        if not assignee_ids and template.default_assignee_id:
            assignee_ids = [template.default_assignee_id]
        owners = [
            _initials(users_map[user_id].full_name or users_map[user_id].username or users_map[user_id].email)
            for user_id in assignee_ids
            if user_id in users_map
        ]
        owner_label = " ".join(dict.fromkeys([owner for owner in owners if owner != "-"])) or "-"
        created = _local_date(template.created_at)
        rows.append([
            str(len(rows) + 1),
            owner_label,
            _display_title(template.title),
            created.strftime("%d.%m.%Y") if created else "-",
        ])
    return rows


async def _question_library_rows(db: AsyncSession) -> list[list[str]]:
    rows = (
        await db.execute(
            select(QuestionCategory.name, QuestionDefinition.text)
            .join(QuestionDefinition, QuestionDefinition.category_id == QuestionCategory.id)
            .order_by(
                QuestionCategory.sort_order,
                QuestionCategory.name,
                QuestionDefinition.sort_order,
                QuestionDefinition.created_at,
            )
        )
    ).all()
    return [
        [str(index), _display_title(category_name), _display_title(question_text)]
        for index, (category_name, question_text) in enumerate(rows, start=1)
    ]


async def _personal_section(
    db: AsyncSession,
    tasks: list[Task],
    names: dict[Any, str],
    assignee_ids_by_task: dict[Any, set[Any]],
    report_day: date,
) -> list[str]:
    personal = [task for task in tasks if task.is_personal and _belongs_to_day(task, report_day)]

    # Common View shows the originating GA/KA note text for note-based tasks, not the task title.
    note_ids = {task.ga_note_origin_id for task in personal if task.ga_note_origin_id}
    note_titles: dict[Any, str] = {}
    if note_ids:
        rows = (await db.execute(select(GaNote.id, GaNote.content).where(GaNote.id.in_(note_ids)))).all()
        note_titles = {note_id: _display_title(content) for note_id, content in rows}

    def _title(task: Task) -> str:
        return note_titles.get(task.ga_note_origin_id) or _display_title(task.title)

    def _is_ga(task: Task) -> bool:
        return bool(PERSONAL_GA.search(_title(task)) or PERSONAL_GA.search(task.title or ""))

    ga_personal = [task for task in personal if _is_ga(task)]

    def _group_key(task: Task) -> str:
        return "DONE" if _is_done(task) else str(task.status or "").upper()

    grouped: dict[str, list[Task]] = {}
    for task in ga_personal:
        grouped.setdefault(_group_key(task), []).append(task)

    known = {key for _, key in PERSONAL_GROUPS}
    other = [task for key, rows in grouped.items() if key not in known for task in rows]
    groups = [*PERSONAL_GROUPS, ("TJERA", "TJERA")] if other else PERSONAL_GROUPS
    grouped["TJERA"] = other

    lines: list[str] = []
    for label, key in groups:
        ordered = sorted(
            grouped.get(key, []),
            key=lambda task: (_task_owners(task, names, assignee_ids_by_task), _title(task)),
        )
        rows_values = [
            [str(index), _task_owners(task, names, assignee_ids_by_task), _title(task)]
            for index, task in enumerate(ordered, start=1)
        ]
        if lines:
            lines.append("")
        lines.extend(_ascii_table(label, PERSONAL_COLUMNS, rows_values))
    return lines


async def _blue_note_rows(db: AsyncSession, report_day: date) -> list[list[str]]:
    notes = (
        await db.execute(
            select(GaNote)
            .where(GaNote.is_converted_to_task.is_(False))
            .where(GaNote.status != GaNoteStatus.CLOSED)
        )
    ).scalars().all()
    if not notes:
        return []

    note_ids = [note.id for note in notes]
    linked_note_ids = set(
        (
            await db.execute(
                select(Task.ga_note_origin_id)
                .where(Task.ga_note_origin_id.in_(note_ids))
                .where(Task.is_active.is_(True))
            )
        ).scalars().all()
    )
    today_notes = [
        note for note in notes
        if note.id not in linked_note_ids
        and report_day in {_local_date(note.created_at), _local_date(note.updated_at)}
    ]
    if not today_notes:
        return []

    author_ids = {note.created_by for note in today_notes if note.created_by}
    names: dict[Any, str] = {}
    if author_ids:
        users = (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()
        names = {user.id: user.full_name or user.username or user.email for user in users}

    # Discussed notes first, then the rest, each chronological.
    ordered = sorted(
        today_notes,
        key=lambda note: (not note.is_discussed, note.created_at or note.updated_at),
    )
    return [
        [
            str(index),
            _initials(names.get(note.created_by)),
            _note_text(note.content),
            "YES" if note.is_discussed else "NO",
            _local_time(note.created_at),
        ]
        for index, note in enumerate(ordered, start=1)
    ]


async def build_after_break_report_sections(db: AsyncSession, report_day: date) -> tuple[list[dict[str, str]], dict[str, Any]]:
    tasks = (await db.execute(select(Task).where(Task.is_active.is_(True)))).scalars().all()
    names = await _assignee_names(db, tasks)
    assignee_ids_by_task = await _effective_task_assignee_ids(db, tasks)

    confirmation_ids = {
        task.confirmation_assignee_id for task in tasks
        if task.confirmation_assignee_id and task.confirmation_assignee_id not in names
    }
    if confirmation_ids:
        confirmation_users = (await db.execute(select(User).where(User.id.in_(confirmation_ids)))).scalars().all()
        names.update({user.id: user.full_name or user.username or user.email for user in confirmation_users})

    section_1 = [
        *_ascii_table(
            "NEW SYSTEM TASKS",
            [("NR", 2), ("WHO", 20), ("TITLE", 56), ("DATA", 10)],
            await _new_system_task_rows(db),
        ),
        "",
        *_ascii_table(
            "PYETJE PER KONFIRMIM",
            [("NR", 2), ("LISTA", 28), ("PYETJA", 56)],
            await _question_library_rows(db),
        ),
    ]
    section_2 = await _personal_section(db, tasks, names, assignee_ids_by_task, report_day)
    section_3 = _ascii_table(
        "NOTES",
        [("NR", 2), ("FROM", 8), ("NOTE", 60), ("DISK", 4), ("TIME", 5)],
        await _blue_note_rows(db, report_day),
    )

    sections = [
        {"title": SECTION_TITLES[0], "body": _normalize_section(section_1)},
        {"title": SECTION_TITLES[1], "body": _normalize_section(section_2)},
        {"title": SECTION_TITLES[2], "body": _normalize_section(section_3)},
    ]
    snapshot = {
        "report_day": report_day.isoformat(),
        "counts": {
            SECTION_TITLES[0]: len(section_1),
            SECTION_TITLES[1]: len(section_2),
            SECTION_TITLES[2]: len(section_3),
        },
    }
    return sections, snapshot


def render_plain_text(subject: str, report_day: date, sections: list[dict[str, str]]) -> str:
    blocks = [subject, f"Sot: {report_day:%d.%m.%Y}", ""]
    for index, section in enumerate(sections, 1):
        blocks.append(f"{index}. {section['title']}\n{section.get('body') or ''}".strip())
    return "\n\n".join(blocks)


def render_html(subject: str, report_day: date, sections: list[dict[str, str]]) -> str:
    section_html = "".join(
        "<div style=\"margin:22px 0 0;\">"
        f"<h2 style=\"font-size:14px;margin:0 0 8px;color:#0f172a;font-family:Arial,sans-serif;\">{index}. {html.escape(section['title'])}</h2>"
        f"{_render_section_body_html(section.get('body') or '')}"
        "</div>"
        for index, section in enumerate(sections, 1)
    )
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
.report-table th,.report-table td{{font-size:12px!important;padding:4px 5px!important;line-height:1.3!important}}
}}
@media only screen and (max-width:600px){{
.report-table,.report-table thead,.report-table tbody,.report-table tr,.report-table th,.report-table td{{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;table-layout:fixed!important}}
.report-table colgroup,.report-table thead{{display:none!important}}
.report-table tr{{border:1px solid #cbd5e1!important;margin:0 0 8px!important}}
.report-table td{{border:0!important;border-bottom:1px solid #e5e7eb!important;white-space:normal!important;word-break:break-all!important;overflow-wrap:anywhere!important}}
.report-table td:last-child{{border-bottom:0!important}}
.report-table td:before{{content:attr(data-label) ': ';display:inline!important;font-weight:700!important;color:#111827!important}}
}}
</style></head><body style="font-family:Arial,sans-serif;color:#111827;background:#f8fafc;margin:0;padding:8px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f8fafc;border-collapse:collapse;">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-collapse:collapse;">
<tr><td style="padding:14px;">
<h1 style="font-size:22px;margin:0 0 8px;font-family:Arial,sans-serif;color:#111827;">{html.escape(subject)}</h1>
<p style="margin:0 0 18px;color:#475569;font-family:Arial,sans-serif;">Sot: {report_day:%d.%m.%Y}</p>
{section_html}
</td></tr></table>
</td></tr></table>
</body></html>"""


async def send_after_break_report(subject: str, recipients: dict[str, list[str]], plain_text: str, html_body: str) -> dict[str, Any]:
    return await send_meetings_report(subject, recipients, plain_text, html_body)
