from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import CommonApprovalStatus, GaNoteStatus, TaskStatus
from app.models.department import Department
from app.models.ga_note import GaNote
from app.models.question_library import QuestionCategory, QuestionDefinition, QuestionUserStatus
from app.models.system_task_template import SystemTaskTemplate
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.services.meetings_report import (
    PERSONAL_GA,
    TECHNICAL_TAG,
    _all_participant_user_ids,
    _assignee_names,
    apply_weekly_planner_task_order,
    _clean_task_title as _display_title,
    _effective_task_assignee_ids,
    _initials,
    _is_open,
    _local_date,
    _local_time,
    _m3_am_pm_label,
    _m3_department_label,
    _m3_finance_ga_sections,
    _normalize_section,
    _render_group_label_html,
    _render_section_block_html,
    _task_owners,
    _wrap_fixed_width,
    _wrap_report_email_html,
    common_view_task_sort_key,
    send_section_report,
)

REPORT_TYPE = "after_break_report"
REPORT_LABEL = "Permbledhja pas pauzes"
SECTION_TITLES = [
    "DET NGA EMAIL/ PX INFO & ZHVILLIM",
    "PROJEKTET: ATO QE KEMI PUNU DHE SKEMI PUNU",
    "A JEMI BRENDA PLANIT ME PROJEKTE/DIZAJN?",
    "PIKAT E BORDIT/DISKUTO APLIKANTAT",
    "A KEMI NEW SYSTEM TASKS/ PYETJE PER KONFIRMIM?",
    "(GA/KA) KUSH KA DET PERSONALISHT?",
    "NOTES TE REJA ( NOT DISSCUSED)",
    "GA MBYLLJA E DET",
    "HV MBYLLJA E DET",
]
MANUAL_SECTION_TITLES = set(SECTION_TITLES[:4])
SECTION_TITLE_ALIASES = {
    "NOTES TE REJA ME TE KALTER DHE DISSCUSED": SECTION_TITLES[6],
    "NOTES TE REJA ME TE KALTER DHE DISSCUSED?": SECTION_TITLES[6],
}
# Personal tasks count only when the title marks them as GA's: initials then a slash or a
# colon, e.g. "DM/GA: BZ GA - P/P PARA PF" or "ER:GA DEVICES". "AT/KA:" and "ER/KA:" stay out.
PERSONAL_COLUMNS = [("NR", 2), ("WHO", 20), ("DEP", 5), ("AM/PM", 5), ("TITLE", 56)]
SYSTEM_TASK_COLUMNS = [("NR", 2), ("WHO", 20), ("DEP", 5), ("AM/PM", 5), ("TITLE", 56), ("DATA", 10)]
PERSONAL_GROUPS = [
    ("TODO", "TODO"),
    ("IN PROGRESS", "IN_PROGRESS"),
    ("WAITING CONFIRMATION", "WAITING_CONFIRMATION"),
    ("DONE", "DONE"),
]
def subject_for(day: date) -> str:
    return f"M2 - PrimeFlow Permbledhja pas pauzes - {day:%d.%m.%Y}"


def is_generated_subject(subject: str | None, day: date) -> bool:
    """Recognize the old and current automatically generated M2 subjects."""
    return (subject or "").strip() in {
        subject_for(day),
        f"PrimeFlow Permbledhja pas pauzes - {day:%d.%m.%Y}",
    }


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
    # Keep short identity columns on one line so one logical row is not split visually.
    no_wrap = {"NR", "WHO", "FROM", "PER", "DISK", "TIME", "ORA", "KOHA", "DATA", "DATE", "LATE"}
    for values in rows_values:
        wrapped = []
        for value, (name, width) in zip(values, columns):
            cleaned = re.sub(r"\s+", " ", value).strip() if value.strip() else ""
            if name.upper() in no_wrap:
                wrapped.append([cleaned])
            else:
                wrapped.append(_wrap_fixed_width(cleaned, width) if cleaned else [""])
        for position in range(max(len(cell) for cell in wrapped)):
            line_cells = [
                cell[position] if position < len(cell) else ""
                for cell in wrapped
            ]
            rows.append("| " + " | ".join(f"{value:<{width}}" for value, (_, width) in zip(line_cells, columns)) + " |")
        rows.append(border)
    return rows


def _note_text(value: str | None) -> str:
    """Strip [[added]]/[[done]] markers only; keep the wrapped text."""
    cleaned = TECHNICAL_TAG.sub("", value or "")
    return re.sub(r"\s+", " ", cleaned).strip() or "-"


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


async def _new_system_task_rows(
    db: AsyncSession, department_codes: dict[Any, str] | None = None
) -> list[list[str]]:
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
        primary_user_id = template.default_assignee_id or (assignee_ids[0] if assignee_ids else None)
        primary_user = users_map.get(primary_user_id)
        user_department = _m3_department_code_label(
            getattr(primary_user, "department_id", None), department_codes
        ) if primary_user else "-"
        created = _local_date(template.created_at)
        rows.append([
            str(len(rows) + 1),
            owner_label,
            user_department,
            _m3_am_pm_label(template),
            _display_title(template.title),
            created.strftime("%d.%m.%Y") if created else "-",
        ])
    return rows


def _format_confirmation_questions(questions: list[tuple[str, str, str]]) -> list[str]:
    """Render pending confirmation questions with their Questions category (Kategoria)."""
    rows: list[list[str]] = []
    for index, (category, text, guidance) in enumerate(questions, 1):
        question = (text or "").strip() or "-"
        tip = (guidance or "").strip()
        if tip:
            question = f"{question} — {tip}"
        rows.append([str(index), (category or "").strip() or "-", question])
    return _ascii_table(
        "PYETJE PER KONFIRMIM",
        [("NR", 2), ("Kategoria", 12), ("PYETJA", 64)],
        rows,
    )


async def _load_1h_confirmation_questions(db: AsyncSession) -> list[tuple[str, str, str]]:
    """Load unconfirmed View Question tasks for M2 PYETJE PER KONFIRMIM.

    Only questions that created an assignee task (from any Questions category)
    appear here. Template/library questions without a task are excluded.
    Once every assigned user marks the question done (or the task is DONE),
    it is omitted.

    Returns (category_name, question_text, guidance) tuples.
    """
    result = (
        await db.execute(
            select(QuestionDefinition, QuestionCategory.name)
            .join(QuestionCategory, QuestionCategory.id == QuestionDefinition.category_id)
            .where(QuestionDefinition.task_id.is_not(None))
            .order_by(
                QuestionDefinition.created_at.asc(),
                QuestionCategory.sort_order,
                QuestionDefinition.sort_order,
            )
        )
    ).all()
    if not result:
        return []

    rows = [row for row, _category_name in result]
    question_ids = [row.id for row in rows]
    task_ids = {row.task_id for row in rows if row.task_id is not None}
    if not task_ids:
        return []

    assignees_by_task: dict = {task_id: set() for task_id in task_ids}
    for task_id, user_id in (
        await db.execute(
            select(TaskAssignee.task_id, TaskAssignee.user_id).where(
                TaskAssignee.task_id.in_(task_ids)
            )
        )
    ).all():
        assignees_by_task.setdefault(task_id, set()).add(user_id)

    done_task_ids = set(
        (
            await db.execute(
                select(Task.id).where(
                    Task.id.in_(task_ids),
                    Task.status == TaskStatus.DONE,
                )
            )
        ).scalars().all()
    )

    done_pairs = {
        (question_id, user_id)
        for question_id, user_id in (
            await db.execute(
                select(QuestionUserStatus.question_id, QuestionUserStatus.user_id).where(
                    QuestionUserStatus.question_id.in_(question_ids),
                    QuestionUserStatus.status == TaskStatus.DONE.value,
                )
            )
        ).all()
    }

    pending: list[tuple[str, str, str]] = []
    seen_text: set[str] = set()
    for row, category_name in result:
        text = (row.text or "").strip()
        if not text:
            continue
        text_key = text.casefold()
        if text_key in seen_text:
            continue

        linked_task_id = row.task_id
        if linked_task_id is None:
            continue
        if linked_task_id in done_task_ids:
            continue

        assignees = assignees_by_task.get(linked_task_id, set())
        if assignees and all((row.id, user_id) in done_pairs for user_id in assignees):
            continue

        seen_text.add(text_key)
        pending.append(((category_name or "").strip() or "-", text, (row.guidance or "").strip()))
    return pending


def _replace_confirmation_questions_block(body: str, question_lines: list[str]) -> str:
    lines = (body or "").splitlines()
    marker_index = next(
        (
            index
            for index, line in enumerate(lines)
            if line.strip().upper().startswith("PYETJE PER KONFIRMIM")
        ),
        -1,
    )
    head = list(lines[:marker_index] if marker_index >= 0 else lines)
    while head and not head[-1].strip():
        head.pop()
    return "\n".join([*head, "", *question_lines]).strip()


def normalize_after_break_report_sections(sections: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    by_title: dict[str, str] = {}
    extras: list[dict[str, str]] = []
    for section in sections or []:
        raw_title = str(section.get("title") or "").strip()
        title = SECTION_TITLE_ALIASES.get(raw_title, raw_title)
        body = str(section.get("body") or "")
        if title in SECTION_TITLES and title not in by_title:
            by_title[title] = body
        elif title:
            extras.append({"title": title, "body": body})

    normalized: list[dict[str, str]] = []
    for title in SECTION_TITLES:
        if title in by_title:
            body = by_title[title]
        elif title in MANUAL_SECTION_TITLES:
            body = "(Ploteso manualisht)"
        elif title == SECTION_TITLES[4]:
            body = "\n".join(["NEW SYSTEM TASKS: 0", "", "PYETJE PER KONFIRMIM: 0"])
        elif title == SECTION_TITLES[5]:
            body = "\n".join(["TODO: 0", "", "IN PROGRESS: 0", "", "WAITING CONFIRMATION: 0", "", "DONE: 0"])
        elif title in {SECTION_TITLES[7], SECTION_TITLES[8]}:
            body = "TODO: 0\n\nIN PROGRESS: 0\n\nDONE: 0\n\nLATE: 0"
        else:
            body = "NOTES: 0"
        normalized.append({"title": title, "body": body})
    # Keep Common View–synced manuals with the other manuals (before auto sections).
    manual_count = len(MANUAL_SECTION_TITLES)
    if not extras:
        return normalized
    return normalized[:manual_count] + extras + normalized[manual_count:]


async def apply_1h_confirmation_questions(
    db: AsyncSession, sections: list[dict[str, str]]
) -> list[dict[str, str]]:
    """Keep NEW SYSTEM TASKS; refresh PYETJE PER KONFIRMIM from PYETJET PER 1H."""
    question_lines = _format_confirmation_questions(await _load_1h_confirmation_questions(db))
    updated: list[dict[str, str]] = []
    for section in sections:
        if section.get("title") == SECTION_TITLES[4]:
            updated.append({
                "title": section["title"],
                "body": _replace_confirmation_questions_block(section.get("body") or "", question_lines),
            })
        else:
            updated.append(section)
    return updated


async def _personal_section(
    db: AsyncSession,
    tasks: list[Task],
    names: dict[Any, str],
    assignee_ids_by_task: dict[Any, set[Any]],
    report_day: date,
    title_pattern: re.Pattern[str] = PERSONAL_GA,
    department_codes: dict[Any, str] | None = None,
) -> list[str]:
    personal = [task for task in tasks if task.is_personal and _belongs_to_day(task, report_day)]
    all_participant_ids = await _all_participant_user_ids(db)

    # Common View shows the originating GA/KA note text for note-based tasks, not the task title.
    note_ids = {task.ga_note_origin_id for task in personal if task.ga_note_origin_id}
    note_titles: dict[Any, str] = {}
    if note_ids:
        rows = (await db.execute(select(GaNote.id, GaNote.content).where(GaNote.id.in_(note_ids)))).all()
        note_titles = {note_id: _display_title(content) for note_id, content in rows}

    def _title(task: Task) -> str:
        return note_titles.get(task.ga_note_origin_id) or _display_title(task.title)

    def _matches_title(task: Task) -> bool:
        return bool(title_pattern.search(_title(task)) or title_pattern.search(task.title or ""))

    ga_personal = [task for task in personal if _matches_title(task)]

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
            key=lambda task: common_view_task_sort_key(
                task, names, assignee_ids_by_task, all_participant_ids=all_participant_ids
            ),
        )
        rows_values = [
            [
                str(index),
                _task_owners(
                    task, names, assignee_ids_by_task, all_participant_ids=all_participant_ids
                ),
                _m3_department_label(task, department_codes),
                _m3_am_pm_label(task),
                _title(task),
            ]
            for index, task in enumerate(ordered, start=1)
        ]
        if lines:
            lines.append("")
        lines.extend(_ascii_table(label, PERSONAL_COLUMNS, rows_values))
    return lines


async def _blue_note_rows(db: AsyncSession) -> list[list[str]]:
    """All eligible PX Notes that have not yet been discussed."""
    notes = (
        await db.execute(
            select(GaNote)
            .where(GaNote.is_converted_to_task.is_(False))
            .where(GaNote.status != GaNoteStatus.CLOSED)
            .where(GaNote.is_discussed.is_(False))
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
    open_notes = [
        note for note in notes
        if note.id not in linked_note_ids
        and not note.is_discussed
    ]
    if not open_notes:
        return []

    author_ids = {note.created_by for note in open_notes if note.created_by}
    names: dict[Any, str] = {}
    if author_ids:
        users = (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()
        names = {user.id: user.full_name or user.username or user.email for user in users}

    ordered = sorted(open_notes, key=lambda note: note.created_at or note.updated_at)
    return [
        [
            str(index),
            "YES" if note.is_discussed else "NO",
            _note_text(note.content),
            _initials(names.get(note.created_by)),
            _local_time(note.created_at),
        ]
        for index, note in enumerate(ordered, start=1)
    ]


async def build_after_break_report_sections(db: AsyncSession, report_day: date) -> tuple[list[dict[str, str]], dict[str, Any]]:
    tasks = (await db.execute(select(Task).where(Task.is_active.is_(True)))).scalars().all()
    names = await _assignee_names(db, tasks)
    assignee_ids_by_task = await _effective_task_assignee_ids(db, tasks)
    await apply_weekly_planner_task_order(db, tasks, assignee_ids_by_task)
    department_codes = {
        department_id: code
        for department_id, code in (await db.execute(select(Department.id, Department.code))).all()
    }

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
            SYSTEM_TASK_COLUMNS,
            await _new_system_task_rows(db, department_codes),
        ),
        "",
        *_format_confirmation_questions(await _load_1h_confirmation_questions(db)),
    ]
    section_2 = await _personal_section(
        db, tasks, names, assignee_ids_by_task, report_day, department_codes=department_codes
    )
    section_3 = _ascii_table(
        "NOTES",
        [("NR", 2), ("DISK", 4), ("NOTE", 60), ("FROM", 8), ("TIME", 5)],
        await _blue_note_rows(db),
    )
    ga_section, hv_section = await _m3_finance_ga_sections(db, tasks, names, report_day)

    sections = [
        {"title": SECTION_TITLES[0], "body": "(Ploteso manualisht)"},
        {"title": SECTION_TITLES[1], "body": "(Ploteso manualisht)"},
        {"title": SECTION_TITLES[2], "body": "(Ploteso manualisht)"},
        {"title": SECTION_TITLES[3], "body": "(Ploteso manualisht)"},
        {"title": SECTION_TITLES[4], "body": _normalize_section(section_1)},
        {"title": SECTION_TITLES[5], "body": _normalize_section(section_2)},
        {"title": SECTION_TITLES[6], "body": _normalize_section(section_3)},
        {"title": SECTION_TITLES[7], "body": ga_section},
        {"title": SECTION_TITLES[8], "body": hv_section},
    ]
    snapshot = {
        "report_day": report_day.isoformat(),
        "counts": {
            SECTION_TITLES[0]: 0,
            SECTION_TITLES[1]: 0,
            SECTION_TITLES[2]: 0,
            SECTION_TITLES[3]: 0,
            SECTION_TITLES[4]: len(section_1),
            SECTION_TITLES[5]: len(section_2),
            SECTION_TITLES[6]: len(section_3),
            SECTION_TITLES[7]: ga_section.count("\n- ") + (1 if ga_section.startswith("- ") else 0),
            SECTION_TITLES[8]: hv_section.count("\n- ") + (1 if hv_section.startswith("- ") else 0),
        },
    }
    return sections, snapshot


def render_plain_text(subject: str, report_day: date, sections: list[dict[str, str]]) -> str:
    blocks = [subject, f"Sot: {report_day:%d.%m.%Y}", ""]
    current_group = ""
    for index, section in enumerate(sections, 1):
        group = _section_group_label(section["title"])
        if group != current_group:
            blocks.append(group)
            current_group = group
        blocks.append(f"{index}. {section['title']}\n{section.get('body') or ''}".strip())
    return "\n\n".join(blocks)


def _section_group_label(title: str) -> str:
    from app.services.meeting_point_manual_sync import section_group_label

    return section_group_label("after_break", title)


def render_html(subject: str, report_day: date, sections: list[dict[str, str]]) -> str:
    section_chunks: list[str] = []
    current_group = ""
    for index, section in enumerate(sections, 1):
        group = _section_group_label(section["title"])
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


async def send_after_break_report(
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
        report_code="M2", report_day=report_day, sections=sections,
    )
