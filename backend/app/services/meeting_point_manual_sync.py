"""Sync Common View meeting pikes into M1/M2/M3 report manual questions."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.after_break_report_draft import AfterBreakReportDraft
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.meetings_report_draft import MeetingsReportDraft
from app.models.morning_report_draft import MorningReportDraft
from app.services.primeflow_report import report_timezone

ReportKind = Literal["morning", "after_break", "meetings"]

# Common View board checklist title -> meeting report
CHECKLIST_TITLE_TO_REPORT: dict[str, ReportKind] = {
    "TAK BORD/GA": "morning",
    "PERMBLEDHJA PAS PAUZES": "after_break",
    "MBYLLJA E DITES": "meetings",
}

DEFAULT_MANUAL_BODY = "(Ploteso manualisht)"


def _compact(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]+", "", (value or "").upper())


def normalize_checklist_title(title: str | None) -> str:
    return re.sub(r"\s+", " ", (title or "").strip().upper())


def report_kind_for_checklist(checklist: Checklist | None) -> ReportKind | None:
    if checklist is None:
        return None
    if checklist.group_key != "board":
        return None
    if checklist.project_id is not None or checklist.task_id is not None:
        return None
    return CHECKLIST_TITLE_TO_REPORT.get(normalize_checklist_title(checklist.title))


def _report_title_sets(kind: ReportKind) -> tuple[list[str], set[str], int]:
    """Return (known section titles in display order, manual titles, manual insert index)."""
    if kind == "morning":
        from app.services.morning_report import MANUAL_SECTION_TITLES, SECTION_TITLES

        return list(SECTION_TITLES), set(MANUAL_SECTION_TITLES), len(MANUAL_SECTION_TITLES)
    if kind == "after_break":
        from app.services.after_break_report import MANUAL_SECTION_TITLES, SECTION_TITLES

        return list(SECTION_TITLES), set(MANUAL_SECTION_TITLES), len(MANUAL_SECTION_TITLES)
    from app.services.meetings_report import DISPLAY_SECTION_TITLES, MANUAL_SECTION_TITLES

    return list(DISPLAY_SECTION_TITLES), set(MANUAL_SECTION_TITLES), len(MANUAL_SECTION_TITLES)


def is_known_report_title(kind: ReportKind, title: str | None) -> bool:
    raw = (title or "").strip()
    if not raw:
        return False
    known, _, _ = _report_title_sets(kind)
    compact = _compact(raw)
    if kind == "morning":
        from app.services.morning_report import SECTION_TITLE_ALIASES, _canonical_section_title

        aliased = SECTION_TITLE_ALIASES.get(raw, raw)
        if _canonical_section_title(aliased) is not None:
            return True
    elif kind == "after_break":
        from app.services.after_break_report import SECTION_TITLE_ALIASES

        raw = SECTION_TITLE_ALIASES.get(raw, raw)
    else:
        from app.services.meetings_report import SECTION_TITLE_ALIASES

        raw = SECTION_TITLE_ALIASES.get(raw, raw)
        compact = _compact(raw)
    return any(_compact(known_title) == compact for known_title in known)


def is_manual_section_title(kind: ReportKind, title: str | None) -> bool:
    """True for built-in manuals and Common View–synced extras."""
    raw = (title or "").strip()
    if not raw:
        return False
    known, manuals, _ = _report_title_sets(kind)
    if raw in manuals:
        return True
    compact = _compact(raw)
    if any(_compact(manual) == compact for manual in manuals):
        return True
    # Synced extras are not part of the known auto/manual template list.
    return not any(_compact(known_title) == compact for known_title in known)


def section_group_label(kind: ReportKind, title: str | None) -> str:
    return "MANUAL QUESTIONS" if is_manual_section_title(kind, title) else "AUTO-FILLED FROM PRIMEFLOW"


def _bodies_by_title(sections: list[dict[str, Any]] | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for section in sections or []:
        title = str(section.get("title") or "").strip()
        if title and title not in out:
            out[title] = str(section.get("body") or "")
    return out


def _insert_manual_extras(
    sections: list[dict[str, str]],
    extras: list[dict[str, str]],
    manual_count: int,
) -> list[dict[str, str]]:
    if not extras:
        return sections
    head = sections[:manual_count]
    tail = sections[manual_count:]
    existing = {_compact(section["title"]) for section in sections}
    unique_extras = [extra for extra in extras if _compact(extra["title"]) not in existing]
    return head + unique_extras + tail


async def load_common_view_extra_titles(db: AsyncSession, kind: ReportKind) -> list[str]:
    checklist_title = next(
        (title for title, report in CHECKLIST_TITLE_TO_REPORT.items() if report == kind),
        None,
    )
    if not checklist_title:
        return []

    checklist = (
        await db.execute(
            select(Checklist)
            .options(selectinload(Checklist.items))
            .where(
                Checklist.group_key == "board",
                Checklist.project_id.is_(None),
                Checklist.task_id.is_(None),
                Checklist.title == checklist_title,
            )
            .order_by(Checklist.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if checklist is None:
        return []

    items = sorted(checklist.items or [], key=lambda item: (item.position, str(item.id)))
    titles: list[str] = []
    seen: set[str] = set()
    for item in items:
        title = (item.title or "").strip()
        if not title:
            continue
        if is_known_report_title(kind, title):
            continue
        key = _compact(title)
        if key in seen:
            continue
        seen.add(key)
        titles.append(title)
    return titles


async def merge_common_view_manual_sections(
    db: AsyncSession,
    sections: list[dict[str, str]],
    kind: ReportKind,
    existing_sections: list[dict[str, Any]] | None = None,
) -> list[dict[str, str]]:
    """Insert Common View pikes that are not already known report questions as manuals."""
    _, _, manual_count = _report_title_sets(kind)
    bodies = _bodies_by_title(existing_sections)
    for section in sections:
        title = section.get("title") or ""
        if title and title not in bodies:
            bodies[title] = section.get("body") or ""

    extras: list[dict[str, str]] = []
    for title in await load_common_view_extra_titles(db, kind):
        extras.append(
            {
                "title": title,
                "body": bodies.get(title) or DEFAULT_MANUAL_BODY,
            }
        )
    return _insert_manual_extras(sections, extras, manual_count)


def _today():
    return datetime.now(report_timezone()).date()


async def _get_or_create_today_draft(db: AsyncSession, kind: ReportKind):
    today = _today()
    if kind == "morning":
        from app.services.meetings_report_scheduler import DEFAULT_RECIPIENTS, normalize_recipients
        from app.services.morning_report import normalize_morning_report_sections, subject_for

        row = (
            await db.execute(select(MorningReportDraft).where(MorningReportDraft.report_date == today))
        ).scalar_one_or_none()
        if row is None:
            row = MorningReportDraft(
                report_date=today,
                subject=subject_for(today),
                recipients=normalize_recipients(DEFAULT_RECIPIENTS),
                sections=normalize_morning_report_sections([]),
                generated_snapshot={},
                status="DRAFT",
            )
            db.add(row)
            await db.flush()
        return row

    if kind == "after_break":
        from app.services.after_break_report import normalize_after_break_report_sections, subject_for
        from app.services.meetings_report_scheduler import DEFAULT_RECIPIENTS, normalize_recipients

        row = (
            await db.execute(
                select(AfterBreakReportDraft).where(AfterBreakReportDraft.report_date == today)
            )
        ).scalar_one_or_none()
        if row is None:
            row = AfterBreakReportDraft(
                report_date=today,
                subject=subject_for(today),
                recipients=normalize_recipients(DEFAULT_RECIPIENTS),
                sections=normalize_after_break_report_sections([]),
                generated_snapshot={},
                status="DRAFT",
            )
            db.add(row)
            await db.flush()
        return row

    from app.services.meetings_report import (
        normalize_meetings_report_sections,
        next_working_day,
        subject_for,
    )
    from app.services.meetings_report_scheduler import DEFAULT_RECIPIENTS, normalize_recipients

    row = (
        await db.execute(select(MeetingsReportDraft).where(MeetingsReportDraft.report_date == today))
    ).scalar_one_or_none()
    if row is None:
        row = MeetingsReportDraft(
            report_date=today,
            tomorrow_date=next_working_day(today),
            subject=subject_for(today),
            recipients=normalize_recipients(DEFAULT_RECIPIENTS),
            sections=normalize_meetings_report_sections([]),
            generated_snapshot={},
            status="DRAFT",
        )
        db.add(row)
        await db.flush()
    return row


def _normalize_draft_sections(kind: ReportKind, sections: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    if kind == "morning":
        from app.services.morning_report import normalize_morning_report_sections

        return normalize_morning_report_sections(sections)
    if kind == "after_break":
        from app.services.after_break_report import normalize_after_break_report_sections

        return normalize_after_break_report_sections(sections)
    from app.services.meetings_report import normalize_meetings_report_sections

    return normalize_meetings_report_sections(sections)


async def sync_checklist_item_manual_question(
    db: AsyncSession,
    checklist: Checklist | None,
    *,
    title: str | None,
    previous_title: str | None = None,
    action: Literal["upsert", "delete"] = "upsert",
) -> None:
    """Mirror a Common View meeting pike onto today's matching M1/M2/M3 draft."""
    kind = report_kind_for_checklist(checklist)
    if kind is None:
        return

    clean_title = (title or "").strip()
    clean_previous = (previous_title or "").strip()

    if action == "upsert" and clean_title and is_known_report_title(kind, clean_title):
        # Pike already corresponds to a built-in report question — no extra manual row.
        if clean_previous and _compact(clean_previous) != _compact(clean_title):
            action = "delete"
            clean_title = clean_previous
            clean_previous = ""
        else:
            return

    row = await _get_or_create_today_draft(db, kind)
    sections = _normalize_draft_sections(kind, row.sections)
    _, _, manual_count = _report_title_sets(kind)

    if action == "delete":
        target = clean_title or clean_previous
        if not target:
            return
        target_key = _compact(target)
        sections = [
            section
            for section in sections
            if _compact(section["title"]) != target_key or is_known_report_title(kind, section["title"])
        ]
        row.sections = sections
        if getattr(row, "status", None) != "SENT":
            row.status = "DRAFT"
        return

    if not clean_title:
        return

    # Rename: drop previous extra title, keep its body when possible.
    preserved_body = DEFAULT_MANUAL_BODY
    if clean_previous and _compact(clean_previous) != _compact(clean_title):
        prev_key = _compact(clean_previous)
        for section in sections:
            if _compact(section["title"]) == prev_key and not is_known_report_title(kind, section["title"]):
                preserved_body = section.get("body") or DEFAULT_MANUAL_BODY
                break
        sections = [
            section
            for section in sections
            if _compact(section["title"]) != prev_key or is_known_report_title(kind, section["title"])
        ]

    for section in sections:
        if _compact(section["title"]) == _compact(clean_title):
            # Already present (known or previously synced).
            row.sections = sections
            return

    extras = [{"title": clean_title, "body": preserved_body}]
    row.sections = _insert_manual_extras(sections, extras, manual_count)
    if getattr(row, "status", None) != "SENT":
        row.status = "DRAFT"
