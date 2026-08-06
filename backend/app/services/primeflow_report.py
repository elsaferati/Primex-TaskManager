from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import re
import smtplib
import ssl
import html
import io
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from email.message import EmailMessage
from email.utils import make_msgid
from typing import Any, Awaitable, Callable
from zoneinfo import ZoneInfo

import httpx
from pydantic import BaseModel, Field
logger = logging.getLogger(__name__)
REPORT_TYPE = "primeflow_1h"
SLOTS = ("10:00", "11:00", "11:50", "14:20", "16:00")
STATUS_ORDER = {"IN_PROGRESS": 0, "TODO": 1, "DONE": 2}
STATUS_MARKERS = {"IN_PROGRESS": "🟡 IN PROGRESS", "TODO": "⚪ TODO", "DONE": "✅ DONE"}
REMINDER_CATEGORY_NORMALIZED = "pyetjet per 1h"
REMINDER_SECTION_TITLE = "PYETJET PER 1H"
TECHNICAL_TAGS = re.compile(r"\[\[\s*/?\s*(?:added|done)\s*\]\]", re.IGNORECASE)
ADDED_TAGS = re.compile(r"\[\[\s*/?\s*added\s*\]\]", re.IGNORECASE)
DONE_BLOCK = re.compile(r"\[\[\s*done\s*\]\](.*?)\[\[\s*/\s*done\s*\]\]", re.IGNORECASE | re.DOTALL)
NUMBERED_ITEM = re.compile(r"(?<!\S)(\d+)\.\s*")
TRANSIENT_CODES = {429, 500, 502, 503, 504}
STATUS_COLORS = {
    "TODO": ("#fbcfe8", "#111827", "#ec4899"),
    "IN_PROGRESS": ("#fef3c7", "#111827", "#d97706"),
    "DONE": ("#d4ffe1", "#14532d", "#22c55e"),
}


class GmailVerificationError(RuntimeError):
    def __init__(self, message: str, response: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.response = response or {}


class ReportTask(BaseModel):
    title: str
    description: str
    marked_title: str = ""
    marked_description: str = ""
    status: str
    marker: str


class ReportEmployee(BaseModel):
    name: str
    tasks: list[ReportTask] = Field(default_factory=list)


class ReportSection(BaseModel):
    title: str
    employees: list[ReportEmployee] = Field(default_factory=list)


class ReportReminderQuestion(BaseModel):
    text: str
    guidance: str = ""


class ReportDocument(BaseModel):
    subject: str
    report_date: date
    report_slot: str
    generated_at: datetime
    source_generated_at: datetime
    recipients: dict[str, list[str]]
    sections: list[ReportSection]
    reminders: list[ReportReminderQuestion] = Field(default_factory=list)
    truncated: bool = False

    @property
    def task_count(self) -> int:
        return sum(len(employee.tasks) for section in self.sections for employee in section.employees)


def report_timezone() -> ZoneInfo:
    return ZoneInfo(os.getenv("PRIMEFLOW_REPORT_TIMEZONE", "Europe/Tirane"))


def previous_working_day(day: date, holidays: set[date] | None = None) -> date:
    holidays = holidays or set()
    candidate = day - timedelta(days=1)
    while candidate.weekday() >= 5 or candidate in holidays:
        candidate -= timedelta(days=1)
    return candidate


def report_subject(day: date, slot: str) -> str:
    if slot not in SLOTS:
        raise ValueError(f"Unsupported report slot: {slot}")
    return f"PrimeFlow 1H – {day:%d.%m.%Y} – {slot}"


def exact_subject(headers: list[dict[str, str]], expected: str) -> bool:
    return any(h.get("name", "").lower() == "subject" and h.get("value") == expected for h in headers)


def clean_description(value: str | None) -> str:
    cleaned = TECHNICAL_TAGS.sub("", value or "")
    return re.sub(r"[ \t]+", " ", cleaned).strip()


def clean_title(value: str | None) -> str:
    return clean_description(value)


def preserve_done_marks(value: str | None) -> str:
    return ADDED_TAGS.sub("", value or "").strip()


def split_numbered_text(value: str) -> tuple[str, list[str]]:
    matches = list(NUMBERED_ITEM.finditer(value))
    if not matches:
        return value.strip(), []
    heading = value[:matches[0].start()].strip()
    items = [
        value[match.start():matches[index + 1].start() if index + 1 < len(matches) else len(value)].strip()
        for index, match in enumerate(matches)
    ]
    return heading, items


def split_task_display(title: str) -> tuple[str, list[str]]:
    """First line stays the black title; every following line renders grey."""
    heading, numbered_items = split_numbered_text(title)
    heading_lines = [line.strip() for line in heading.splitlines() if line.strip()]
    if not heading_lines:
        return "", numbered_items
    return heading_lines[0], [*heading_lines[1:], *numbered_items]


def done_ranges(value: str, marked_source: str) -> list[tuple[int, int]]:
    ranges = []
    cursor = 0
    for match in DONE_BLOCK.finditer(marked_source):
        selected = TECHNICAL_TAGS.sub("", match.group(1))
        start = value.find(selected, cursor)
        if start >= 0:
            ranges.append((start, start + len(selected)))
            cursor = start + len(selected)
    return ranges


def _task_date(item: dict[str, Any]) -> date | None:
    raw = item.get("report_date") or item.get("date") or item.get("day")
    if not raw:
        raw = item.get("planned_for") or item.get("due_date") or item.get("start_date")
    try:
        return date.fromisoformat(str(raw)[:10]) if raw else None
    except ValueError:
        return None


def _slot(item: dict[str, Any]) -> str | None:
    return item.get("one_h_report_slot") or item.get("slot") or item.get("time_slot")


def _employee(item: dict[str, Any]) -> str:
    return str(
        item.get("employee") or item.get("person") or item.get("owner")
        or item.get("user_name") or item.get("assignee_name") or item.get("user") or ""
    ).strip()


def employee_initials(name: str) -> str:
    parts = re.findall(r"[^\W\d_]+", name, flags=re.UNICODE)
    return "".join(part[0] for part in parts).upper()


def filter_tasks(
    items: list[dict[str, Any]], day: date, slot: str | None = None,
) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result = []
    for item in items:
        employee = _employee(item)
        title = item.get("task_title") or item.get("title") or item.get("task")
        if not employee or not str(title or "").strip() or _task_date(item) != day:
            continue
        if slot is not None and _slot(item) != slot:
            continue
        key = str(item.get("id") or json.dumps(item, sort_keys=True, default=str))
        if key in seen:
            continue
        seen.add(key)
        status = str(item.get("status") or "").upper()
        if status not in STATUS_ORDER:
            logger.error("Unexpected task status task_id=%s status=%s", key, status)
            continue
        result.append(item)
    return result


def _render_section(title: str, tasks: list[dict[str, Any]]) -> str:
    lines = [title]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for task in tasks:
        grouped.setdefault(_employee(task), []).append(task)
    for employee_index, employee in enumerate(sorted(grouped, key=str.casefold), 1):
        lines.append(f"{employee_index}. {employee}")
        ordered = sorted(grouped[employee], key=lambda x: (STATUS_ORDER[str(x.get("status")).upper()], str(x.get("task_title") or x.get("title") or x.get("task"))))
        for task_index, task in enumerate(ordered, 1):
            status = str(task.get("status")).upper()
            title_value = clean_title(str(task.get("task_title") or task.get("title") or task.get("task")))
            description = clean_description(task.get("description") if "description" in task else task.get("note"))
            lines.extend([f"{employee_index}.{task_index} {STATUS_MARKERS[status]} {title_value}", "Përshkrimi:", description])
    if not grouped:
        lines.append("(Asnjë detyrë)")
    return "\n".join(lines)


def _document_section(title: str, tasks: list[dict[str, Any]]) -> ReportSection:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for task in tasks:
        grouped.setdefault(_employee(task), []).append(task)
    employees = []
    for employee in sorted(grouped, key=str.casefold):
        ordered = sorted(grouped[employee], key=lambda x: (
            STATUS_ORDER[str(x.get("status")).upper()],
            str(x.get("task_title") or x.get("title") or x.get("task")),
        ))
        employees.append(ReportEmployee(
            name=employee_initials(employee),
            tasks=[
                ReportTask(
                    title=clean_title(str(task.get("task_title") or task.get("title") or task.get("task"))),
                    description=clean_description(task.get("description") if "description" in task else task.get("note")),
                    marked_title=preserve_done_marks(str(task.get("task_title") or task.get("title") or task.get("task"))),
                    marked_description=preserve_done_marks(
                        task.get("description") if "description" in task else task.get("note")
                    ),
                    status=str(task.get("status")).upper(),
                    marker=STATUS_MARKERS[str(task.get("status")).upper()],
                )
                for task in ordered
            ],
        ))
    return ReportSection(title=title, employees=employees)


def build_report_document(
    data: dict[str, Any],
    report_day: date,
    slot: str,
    recipients: dict[str, list[str]] | None = None,
    reminders: list[ReportReminderQuestion] | None = None,
) -> ReportDocument:
    guardrails = data.get("guardrails") or {}
    truncated = any((guardrails.get("truncated") or {}).values())
    if truncated:
        raise ValueError("Common View contains truncated buckets")
    items = data.get("items") or {}
    one_h = items.get("oneH") or data.get("tasks") or []
    definitions: list[tuple[str, list[dict[str, Any]]]] = []
    if slot == "10:00":
        for candidate in SLOTS:
            definitions.append(
                (
                    f"SLOTI {report_day:%d.%m.%Y} {candidate}",
                    filter_tasks(one_h, report_day, candidate),
                )
            )
        definitions.extend([
            ("DETYRA PA SLOT – E GJITHË DITA", [
                task for task in filter_tasks(one_h, report_day, None) if _slot(task) is None
            ]),
            ("DETYRAT E BLLOKUT", filter_tasks(items.get("blocked") or [], report_day)),
            ("P: PERSONALE", filter_tasks(items.get("personal") or [], report_day)),
            ("R1 = 1H", filter_tasks(items.get("r1") or [], report_day)),
        ])
    else:
        previous_slot = SLOTS[SLOTS.index(slot) - 1]
        definitions.extend([
            (
                f"SLOTI {report_day:%d.%m.%Y} {slot}",
                filter_tasks(one_h, report_day, slot),
            ),
            (
                f"SLOTI PARAPRAK {report_day:%d.%m.%Y} {previous_slot}",
                filter_tasks(one_h, report_day, previous_slot),
            ),
        ])
    generated_value = data.get("generated_at") or datetime.now(report_timezone()).isoformat()
    source_generated = datetime.fromisoformat(str(generated_value).replace("Z", "+00:00"))
    return ReportDocument(
        subject=report_subject(report_day, slot),
        report_date=report_day,
        report_slot=slot,
        generated_at=datetime.now(report_timezone()),
        source_generated_at=source_generated,
        recipients=recipients or {"to": [], "cc": [], "bcc": []},
        sections=[_document_section(title, tasks) for title, tasks in definitions],
        reminders=list(reminders or []),
    )


def render_plain_text(document: ReportDocument) -> str:
    blocks = [document.subject, f"Generated: {document.generated_at.isoformat()}", ""]
    if document.reminders:
        reminder_lines = [REMINDER_SECTION_TITLE]
        for index, question in enumerate(document.reminders, 1):
            reminder_lines.append(f"{index}. {question.text}")
            if question.guidance:
                reminder_lines.append(question.guidance)
        blocks.append("\n".join(reminder_lines))
    for section in document.sections:
        lines = [section.title]
        if not section.employees:
            lines.append("(Asnjë detyrë)")
        for employee in section.employees:
            lines.append(employee.name)
            for task in employee.tasks:
                heading, detail_lines = split_task_display(task.title)
                if heading:
                    lines.append(heading)
                lines.extend(detail_lines)
                if task.description:
                    lines.append(task.description)
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def render_html(document: ReportDocument) -> str:
    def marked_html(value: str, marked_source: str) -> str:
        ranges = done_ranges(value, marked_source)
        boundaries = sorted({0, len(value), *(point for item in ranges for point in item)})
        parts = []
        for start, end in zip(boundaries, boundaries[1:]):
            content = html.escape(value[start:end]).replace(chr(10), "<br>")
            if any(left <= start and right >= end for left, right in ranges):
                content = f"<span class='done'>{content}</span>"
            parts.append(content)
        return "".join(parts)

    sections = []
    if document.reminders:
        reminder_cards = []
        for index, question in enumerate(document.reminders, 1):
            guidance = (
                f"<div class='detail' style='color:#64748b'>{html.escape(question.guidance).replace(chr(10), '<br>')}</div>"
                if question.guidance else ""
            )
            reminder_cards.append(
                f"<article class='task reminder' style='background:#f8fafc;border-color:#64748b'>"
                f"<div class='task-title' style='color:#050505'>"
                f"{index}. {html.escape(question.text)}</div>{guidance}</article>"
            )
        sections.append(
            f"<section><div class='section-title'>{html.escape(REMINDER_SECTION_TITLE)}</div>"
            f"{''.join(reminder_cards)}</section>"
        )
    for section in document.sections:
        employees = []
        for employee_index, employee in enumerate(section.employees, 1):
            task_cards = []
            for task in employee.tasks:
                background, _, accent = STATUS_COLORS[task.status]
                heading, detail_lines = split_task_display(task.title)
                detail_html = "".join(
                    f"<div class='detail' style='color:#64748b'>{marked_html(item, task.marked_title)}</div>"
                    for item in detail_lines
                )
                description = (
                    f"<div class='detail' style='color:#64748b'>"
                    f"{marked_html(task.description, task.marked_description)}</div>"
                    if task.description else ""
                )
                task_cards.append(
                    f"<article class='task' style='background:{background};border-color:{accent}'>"
                    f"<div class='task-title' style='color:#050505'>"
                    f"{marked_html(heading or task.title, task.marked_title)}</div>"
                    f"{detail_html}{description}</article>"
                )
            employees.append(
                f"<div class='employee'><div class='employee-name'>{html.escape(employee.name)}</div>"
                f"{''.join(task_cards)}</div>"
            )
        employee_html = "".join(employees) or '<div class="empty">(Asnjë detyrë)</div>'
        sections.append(
            f"<section><div class='section-title'>{html.escape(section.title)}</div>"
            f"{employee_html}</section>"
        )
    return (
        "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<style>body{margin:0;background:#f8fafc;font-family:Arial,'Segoe UI Emoji',sans-serif;color:#0f172a;line-height:1.4}"
        ".shell{max-width:980px;margin:0 auto;padding:20px}.header{background:#8799b2;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0}"
        ".header h1{font-size:24px;margin:0 0 5px}.meta{font-size:13px;opacity:.95}.content{background:#fff;padding:20px}"
        "section{margin:0 0 24px}.section-title{background:#eef2ff;border-left:5px solid #2563eb;padding:11px 14px;font-size:18px;font-weight:800}"
        ".employee{margin:14px 0}.employee-name{font-size:16px;font-weight:800;margin:0 0 8px}"
        ".task{border:1px solid;border-left-width:5px;border-radius:7px;padding:12px 14px;margin:8px 0;box-sizing:border-box}"
        ".task-title{font-weight:800;font-size:14px;color:#050505;word-break:break-word}"
        ".detail{font-size:13px;color:#64748b;font-weight:400;margin-top:5px;word-break:break-word}"
        ".done{text-decoration:line-through;text-decoration-thickness:2px}.empty{color:#64748b;padding:12px}"
        "@media(max-width:600px){.shell{padding:0}.header{border-radius:0;padding:16px}.header h1{font-size:20px}"
        ".content{padding:12px}.section-title{font-size:16px}.task{padding:10px}.task-title{font-size:13px}}</style>"
        "</head><body><div class='shell'>"
        f"<div class='header'><h1>{html.escape(document.subject)}</h1><div class='meta'>Generated {document.generated_at.isoformat()} · "
        f"{document.task_count} tasks</div></div><div class='content'>{''.join(sections)}</div></div></body></html>"
    )


def render_docx(document: ReportDocument) -> bytes:
    from docx import Document
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Inches, Pt, RGBColor

    def shade(cell: Any, color: str) -> None:
        fill = OxmlElement("w:shd")
        fill.set(qn("w:fill"), color.lstrip("#"))
        cell._tc.get_or_add_tcPr().append(fill)

    def add_marked_runs(paragraph: Any, value: str, marked_source: str, *, bold: bool, color: str) -> None:
        ranges = done_ranges(value, marked_source)
        boundaries = sorted({0, len(value), *(point for item in ranges for point in item)})
        for start, end in zip(boundaries, boundaries[1:]):
            run = paragraph.add_run(value[start:end])
            run.bold = bold
            run.font.strike = any(left <= start and right >= end for left, right in ranges)
            run.font.size = Pt(9.5 if bold else 9)
            run.font.color.rgb = RGBColor.from_string(color.lstrip("#"))

    output = io.BytesIO()
    doc = Document()
    doc.sections[0].top_margin = doc.sections[0].bottom_margin = Inches(0.65)
    doc.sections[0].left_margin = doc.sections[0].right_margin = Inches(0.7)
    title_cell = doc.add_table(rows=1, cols=1).cell(0, 0)
    shade(title_cell, "#8799b2")
    title_run = title_cell.paragraphs[0].add_run(document.subject)
    title_run.bold = True
    title_run.font.size = Pt(20)
    title_run.font.color.rgb = RGBColor(255, 255, 255)
    meta = title_cell.add_paragraph(f"Generated {document.generated_at.isoformat()} · {document.task_count} tasks")
    meta.runs[0].font.size = Pt(9)
    meta.runs[0].font.color.rgb = RGBColor(255, 255, 255)
    if document.reminders:
        doc.add_paragraph()
        reminder_header = doc.add_table(rows=1, cols=1).cell(0, 0)
        shade(reminder_header, "#eef2ff")
        reminder_run = reminder_header.paragraphs[0].add_run(REMINDER_SECTION_TITLE)
        reminder_run.bold = True
        reminder_run.font.size = Pt(13)
        for index, question in enumerate(document.reminders, 1):
            card_cell = doc.add_table(rows=1, cols=1).cell(0, 0)
            shade(card_cell, "#f8fafc")
            add_marked_runs(
                card_cell.paragraphs[0],
                f"{index}. {question.text}",
                f"{index}. {question.text}",
                bold=True,
                color="#050505",
            )
            if question.guidance:
                guidance = card_cell.add_paragraph()
                add_marked_runs(
                    guidance, question.guidance, question.guidance, bold=False, color="#64748b"
                )
            doc.add_paragraph().paragraph_format.space_after = Pt(0)
    for section in document.sections:
        doc.add_paragraph()
        section_cell = doc.add_table(rows=1, cols=1).cell(0, 0)
        shade(section_cell, "#eef2ff")
        section_run = section_cell.paragraphs[0].add_run(section.title)
        section_run.bold = True
        section_run.font.size = Pt(13)
        if not section.employees:
            doc.add_paragraph("(Asnjë detyrë)")
        for employee in section.employees:
            employee_paragraph = doc.add_paragraph()
            employee_paragraph.paragraph_format.space_before = Pt(8)
            employee_paragraph.paragraph_format.space_after = Pt(3)
            employee_run = employee_paragraph.add_run(employee.name)
            employee_run.bold = True
            employee_run.font.size = Pt(11)
            for task in employee.tasks:
                background, _, _ = STATUS_COLORS[task.status]
                card_cell = doc.add_table(rows=1, cols=1).cell(0, 0)
                shade(card_cell, background)
                heading, detail_lines = split_task_display(task.title)
                add_marked_runs(card_cell.paragraphs[0], heading or task.title, task.marked_title, bold=True, color="#050505")
                for item in detail_lines:
                    detail = card_cell.add_paragraph()
                    detail.paragraph_format.space_after = Pt(2)
                    add_marked_runs(detail, item, task.marked_title, bold=False, color="#64748b")
                if task.description:
                    description = card_cell.add_paragraph()
                    add_marked_runs(
                        description, task.description, task.marked_description, bold=False, color="#64748b"
                    )
                doc.add_paragraph().paragraph_format.space_after = Pt(0)
    doc.save(output)
    return output.getvalue()


def render_png(document: ReportDocument) -> bytes:
    from PIL import Image, ImageDraw, ImageFont
    width, margin = 1400, 55
    font_path = os.getenv("PRIMEFLOW_REPORT_FONT_PATH", r"C:\Windows\Fonts\seguiemj.ttf")
    fallback = r"C:\Windows\Fonts\arial.ttf"
    try:
        font = ImageFont.truetype(font_path if os.path.exists(font_path) else fallback, 20)
        bold = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 21)
        heading = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 30)
    except OSError:
        font = bold = heading = ImageFont.load_default()
    import textwrap

    def draw_line_with_marks(x: int, line_y: int, line: str, marked_source: str, line_font: Any, color: str) -> None:
        draw.text((x, line_y), line, fill=color, font=line_font)
        selected_values = [TECHNICAL_TAGS.sub("", match.group(1)).strip() for match in DONE_BLOCK.finditer(marked_source)]
        if any(line.strip() in selected or selected in line for selected in selected_values if selected):
            bounds = draw.textbbox((x, line_y), line, font=line_font)
            strike_y = (bounds[1] + bounds[3]) // 2
            draw.line((bounds[0], strike_y, bounds[2], strike_y), fill=color, width=2)

    estimated_lines = (
        8
        + len(document.sections) * 3
        + sum(
            2 + len(textwrap.wrap(question.text, 90)) + len(textwrap.wrap(question.guidance or "", 95))
            for question in document.reminders
        )
        + sum(
            3 + sum(
                4 + len(textwrap.wrap(task.title, 85)) + len(textwrap.wrap(task.description, 90))
                for task in employee.tasks
            )
            for section in document.sections
            for employee in section.employees
        )
    )
    height = max(650, 140 + estimated_lines * 30)
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((margin, 35, width - margin, 135), radius=12, fill="#8799b2")
    draw.text((margin + 24, 55), document.subject, fill="white", font=heading)
    draw.text((margin + 24, 99), f"Generated {document.generated_at.isoformat()} · {document.task_count} tasks", fill="white", font=font)
    y = 160
    if document.reminders:
        draw.rectangle((margin, y, width - margin, y + 48), fill="#eef2ff")
        draw.rectangle((margin, y, margin + 7, y + 48), fill="#2563eb")
        draw.text((margin + 18, y + 11), REMINDER_SECTION_TITLE, fill="#0f172a", font=bold)
        y += 62
        for index, question in enumerate(document.reminders, 1):
            title_lines = textwrap.wrap(f"{index}. {question.text}", 95) or [""]
            guidance_lines = textwrap.wrap(question.guidance, 105) if question.guidance else []
            card_height = 25 + 28 * (len(title_lines) + len(guidance_lines))
            draw.rounded_rectangle(
                (margin + 5, y, width - margin, y + card_height),
                radius=8,
                fill="#f8fafc",
                outline="#64748b",
                width=2,
            )
            draw.rectangle((margin + 5, y + 4, margin + 11, y + card_height - 4), fill="#64748b")
            line_y = y + 12
            for line in title_lines:
                draw.text((margin + 25, line_y), line, fill="#050505", font=bold)
                line_y += 28
            for line in guidance_lines:
                draw.text((margin + 25, line_y), line, fill="#64748b", font=font)
                line_y += 28
            y += card_height + 12
        y += 14
    for section in document.sections:
        draw.rectangle((margin, y, width - margin, y + 48), fill="#eef2ff")
        draw.rectangle((margin, y, margin + 7, y + 48), fill="#2563eb")
        draw.text((margin + 18, y + 11), section.title, fill="#0f172a", font=bold)
        y += 62
        if not section.employees:
            draw.text((margin + 18, y), "(Asnjë detyrë)", fill="#64748b", font=font)
            y += 40
        for employee in section.employees:
            draw.text((margin + 5, y), employee.name, fill="#0f172a", font=bold)
            y += 38
            for task in employee.tasks:
                background, _, accent = STATUS_COLORS[task.status]
                task_heading, detail_items = split_task_display(task.title)
                title_lines = textwrap.wrap(task_heading or task.title, 95) or [""]
                detail_lines = [
                    line for item in detail_items
                    for line in (textwrap.wrap(item, 105, subsequent_indent="   ") or [""])
                ]
                description_lines = textwrap.wrap(task.description, 105) if task.description else []
                card_height = 25 + 28 * (len(title_lines) + len(detail_lines) + len(description_lines))
                draw.rounded_rectangle((margin + 5, y, width - margin, y + card_height), radius=8, fill=background, outline=accent, width=2)
                draw.rectangle((margin + 5, y + 4, margin + 11, y + card_height - 4), fill=accent)
                line_y = y + 12
                for line in title_lines:
                    draw_line_with_marks(margin + 25, line_y, line, task.marked_title, bold, "#050505")
                    line_y += 28
                for line in detail_lines:
                    draw_line_with_marks(margin + 25, line_y, line, task.marked_title, font, "#64748b")
                    line_y += 28
                for line in description_lines:
                    draw_line_with_marks(margin + 25, line_y, line, task.marked_description, font, "#64748b")
                    line_y += 28
                y += card_height + 12
        y += 14
    image = image.crop((0, 0, width, y + margin))
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def build_report(data: dict[str, Any], report_day: date, slot: str) -> str:
    return render_plain_text(build_report_document(data, report_day, slot))


async def retry(operation: Callable[[], Awaitable[Any]], *, delays: tuple[float, ...] = (0, 2, 5)) -> Any:
    last: Exception | None = None
    for attempt, delay in enumerate(delays, 1):
        if delay:
            await asyncio.sleep(delay)
        try:
            return await operation()
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.RemoteProtocolError) as exc:
            last = exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in TRANSIENT_CODES:
                raise
            last = exc
        logger.warning("transient_operation_failure attempt=%s error=%s", attempt, type(last).__name__)
    assert last is not None
    raise last


@dataclass
class PrimeFlowClient:
    base_url: str
    email: str | None
    password: str | None
    access_token: str | None = None

    async def _token(self, client: httpx.AsyncClient) -> str:
        if self.access_token:
            return self.access_token
        response = await client.post("/api/auth/login", json={"email": self.email, "password": self.password})
        response.raise_for_status()
        self.access_token = response.json().get("access_token") or response.json().get("accessToken")
        if not self.access_token:
            raise ValueError("PrimeFlow login response contained no access token")
        return self.access_token

    async def common_view(self, day: date) -> dict[str, Any]:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30) as client:
            async def retrieve(week_day: date) -> dict[str, Any]:
                params = {
                    "week_start": week_day.isoformat(),
                    "include_all_departments": "true",
                    "freeze_one_h_slots": "false",
                    "max_items_per_bucket": 5000,
                }
                token = await self._token(client)
                response = await client.get(
                    "/api/common-view",
                    params=params,
                    headers={"Authorization": f"Bearer {token}", "Cache-Control": "no-cache"},
                )
                if response.status_code == 401:
                    self.access_token = None
                    token = await self._token(client)
                    response = await client.get(
                        "/api/common-view",
                        params=params,
                        headers={"Authorization": f"Bearer {token}", "Cache-Control": "no-cache"},
                    )
                response.raise_for_status()
                payload = response.json()
                if any((payload.get("guardrails", {}).get("truncated") or {}).values()):
                    raise ValueError("Common View contains truncated buckets")
                return payload
            current = await retry(lambda: retrieve(day))
            if day.weekday() != 0:
                return current
            previous = await retry(lambda: retrieve(previous_working_day(day)))
            for bucket, values in (previous.get("items") or {}).items():
                current.setdefault("items", {}).setdefault(bucket, []).extend(values)
            current["generated_at"] = max(current["generated_at"], previous["generated_at"])
            return current


class GmailService:
    def __init__(self) -> None:
        self.sender = os.environ["EMAIL_USER"].strip()
        self.password = os.environ["EMAIL_PASSWORD"].replace(" ", "")
        self.host = os.getenv("EMAIL_HOST", "smtp.gmail.com").strip()
        self.port = int(os.getenv("EMAIL_PORT", "587"))

    async def find_exact(self, subject: str, recipients: list[str] | None = None) -> dict[str, Any] | None:
        # SMTP has no mailbox-search operation. Database uniqueness and row locks
        # in the delivery service provide the idempotency guard for SMTP sends.
        return None

    async def send_verified(
        self, subject: str, recipients: list[str] | dict[str, list[str]], body: str,
        html_body: str | None = None,
        attachments: list[tuple[str, bytes, str]] | None = None,
        message_id: str | None = None,
    ) -> dict[str, Any]:
        recipient_map = recipients if isinstance(recipients, dict) else {"to": recipients, "cc": [], "bcc": []}
        all_recipients = sum(recipient_map.values(), [])
        if not recipient_map["to"]:
            raise ValueError("At least one To recipient is required")
        message = EmailMessage()
        message_id = message_id or make_msgid(domain=self.sender.rsplit("@", 1)[-1])
        if not message_id.startswith("<"):
            message_id = f"<{message_id}>"
        message["From"] = self.sender
        message["To"] = ", ".join(recipient_map["to"])
        message["Subject"] = subject
        message["Message-ID"] = message_id
        message["X-Entity-Ref-ID"] = message_id.strip("<>")
        if recipient_map["cc"]:
            message["Cc"] = ", ".join(recipient_map["cc"])
        if recipient_map["bcc"]:
            message["Bcc"] = ", ".join(recipient_map["bcc"])
        message.set_content(body, charset="utf-8")
        if html_body:
            # multipart/alternative with HTML last — Outlook/Gmail prefer the last part.
            message.add_alternative(html_body, subtype="html", charset="utf-8")
        for filename, content, mime_type in attachments or []:
            maintype, subtype = mime_type.split("/", 1)
            message.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)

        def send_smtp() -> None:
            context = ssl.create_default_context()
            with smtplib.SMTP(self.host, self.port, timeout=30) as smtp:
                smtp.ehlo()
                smtp.starttls(context=context)
                smtp.ehlo()
                smtp.login(self.sender, self.password)
                smtp.send_message(message, from_addr=self.sender, to_addrs=all_recipients)

        await asyncio.to_thread(send_smtp)
        return {"id": message_id.strip("<>"), "threadId": None}


def predecessor(day: date, slot: str) -> tuple[date, str]:
    index = SLOTS.index(slot)
    return (previous_working_day(day), "16:00") if index == 0 else (day, SLOTS[index - 1])
