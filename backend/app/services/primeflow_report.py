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
SCHEDULES = {"10:00": "09:00", "11:00": "10:50", "11:50": "11:40", "14:20": "14:10", "16:00": "15:50"}
STATUS_ORDER = {"IN_PROGRESS": 0, "TODO": 1, "DONE": 2}
STATUS_MARKERS = {"IN_PROGRESS": "🟡 IN PROGRESS", "TODO": "⚪ TODO", "DONE": "✅ DONE"}
TECHNICAL_TAGS = re.compile(r"\[\[/?(?:added|done)\]\]")
TRANSIENT_CODES = {429, 500, 502, 503, 504}


class GmailVerificationError(RuntimeError):
    def __init__(self, message: str, response: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.response = response or {}


class ReportTask(BaseModel):
    title: str
    description: str
    status: str
    marker: str


class ReportEmployee(BaseModel):
    name: str
    tasks: list[ReportTask] = Field(default_factory=list)


class ReportSection(BaseModel):
    title: str
    employees: list[ReportEmployee] = Field(default_factory=list)


class ReportDocument(BaseModel):
    subject: str
    report_date: date
    report_slot: str
    generated_at: datetime
    source_generated_at: datetime
    recipients: dict[str, list[str]]
    sections: list[ReportSection]
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
    return TECHNICAL_TAGS.sub("", value or "")


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


def filter_tasks(items: list[dict[str, Any]], day: date, slot: str | None = None) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result = []
    for item in items:
        employee = _employee(item)
        title = item.get("task_title") or item.get("title") or item.get("task")
        if not employee or not str(title or "").strip() or _task_date(item) != day:
            continue
        if slot is not None and _slot(item) != slot:
            continue
        key = str(item.get("id") or item.get("task_id") or json.dumps(item, sort_keys=True, default=str))
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
            title_value = str(task.get("task_title") or task.get("title") or task.get("task"))
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
            name=employee,
            tasks=[
                ReportTask(
                    title=str(task.get("task_title") or task.get("title") or task.get("task")),
                    description=clean_description(task.get("description") if "description" in task else task.get("note")),
                    status=str(task.get("status")).upper(),
                    marker=STATUS_MARKERS[str(task.get("status")).upper()],
                )
                for task in ordered
            ],
        ))
    return ReportSection(title=title, employees=employees)


def build_report_document(
    data: dict[str, Any], report_day: date, slot: str, recipients: dict[str, list[str]] | None = None,
) -> ReportDocument:
    guardrails = data.get("guardrails") or {}
    truncated = any((guardrails.get("truncated") or {}).values())
    if truncated:
        raise ValueError("Common View contains truncated buckets")
    items = data.get("items") or {}
    one_h = items.get("oneH") or data.get("tasks") or []
    definitions: list[tuple[str, list[dict[str, Any]]]] = []
    if slot == "10:00":
        prev = previous_working_day(report_day)
        definitions.append((f"SLOTI {prev:%d.%m.%Y} 16:00", filter_tasks(one_h, prev, "16:00")))
    current_index = SLOTS.index(slot)
    start_index = current_index if current_index == 0 else current_index - 1
    for candidate in SLOTS[start_index:]:
        definitions.append((f"SLOTI {report_day:%d.%m.%Y} {candidate}", filter_tasks(one_h, report_day, candidate)))
    definitions.extend([
        ("DETYRA PA SLOT – E GJITHË DITA", [t for t in filter_tasks(one_h, report_day, None) if _slot(t) is None]),
        ("DETYRAT E BLLOKUT", filter_tasks(items.get("blocked") or [], report_day)),
        ("P: PERSONALE", filter_tasks(items.get("personal") or [], report_day)),
        ("R1 = 1H", filter_tasks(items.get("r1") or [], report_day)),
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
    )


def render_plain_text(document: ReportDocument) -> str:
    blocks = [document.subject, f"Generated: {document.generated_at.isoformat()}", ""]
    for section in document.sections:
        lines = [section.title]
        if not section.employees:
            lines.append("(Asnjë detyrë)")
        for employee_index, employee in enumerate(section.employees, 1):
            lines.append(f"{employee_index}. {employee.name}")
            for task_index, task in enumerate(employee.tasks, 1):
                lines.extend([
                    f"{employee_index}.{task_index} {task.marker} {task.title}",
                    "Përshkrimi:",
                    task.description,
                ])
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def render_html(document: ReportDocument) -> str:
    sections = []
    for section in document.sections:
        employees = []
        for employee_index, employee in enumerate(section.employees, 1):
            tasks = "".join(
                f"<article class='task'><h4>{employee_index}.{task_index} {html.escape(task.marker)} {html.escape(task.title)}</h4>"
                f"<strong>Përshkrimi:</strong><div class='description'>{html.escape(task.description).replace(chr(10), '<br>')}</div></article>"
                for task_index, task in enumerate(employee.tasks, 1)
            )
            employees.append(f"<div class='employee'><h3>{employee_index}. {html.escape(employee.name)}</h3>{tasks}</div>")
        sections.append(f"<section><h2>{html.escape(section.title)}</h2>{''.join(employees) or '<p>(Asnjë detyrë)</p>'}</section>")
    return (
        "<!doctype html><html><head><meta charset='utf-8'><style>"
        "body{font-family:Arial,'Segoe UI Emoji',sans-serif;color:#172033;max-width:900px;margin:24px auto;line-height:1.45}"
        "header{border-bottom:3px solid #3157d5;margin-bottom:24px}.meta{color:#64748b}.employee{margin:16px 0}"
        "section{page-break-inside:avoid;margin:28px 0}h2{background:#eef2ff;padding:10px;border-left:4px solid #3157d5}"
        ".task{border-left:2px solid #cbd5e1;padding-left:14px;margin:12px 0}.description{white-space:normal;margin-top:6px}"
        "</style></head><body>"
        f"<header><h1>{html.escape(document.subject)}</h1><p class='meta'>Generated {document.generated_at.isoformat()} · "
        f"{document.task_count} tasks</p></header>{''.join(sections)}</body></html>"
    )


def render_docx(document: ReportDocument) -> bytes:
    from docx import Document
    from docx.shared import Pt
    output = io.BytesIO()
    doc = Document()
    doc.add_heading(document.subject, 0)
    doc.add_paragraph(f"Report date: {document.report_date.isoformat()}")
    doc.add_paragraph(f"Report slot: {document.report_slot}")
    doc.add_paragraph(f"Generated: {document.generated_at.isoformat()}")
    doc.add_paragraph("Recipients: " + ", ".join(sum(document.recipients.values(), [])))
    for section in document.sections:
        doc.add_heading(section.title, level=1)
        if not section.employees:
            doc.add_paragraph("(Asnjë detyrë)")
        for employee_index, employee in enumerate(section.employees, 1):
            doc.add_heading(f"{employee_index}. {employee.name}", level=2)
            for task_index, task in enumerate(employee.tasks, 1):
                paragraph = doc.add_paragraph()
                run = paragraph.add_run(f"{employee_index}.{task_index} {task.marker} {task.title}")
                run.bold, run.font.size = True, Pt(10)
                doc.add_paragraph("Përshkrimi:")
                doc.add_paragraph(task.description)
    doc.save(output)
    return output.getvalue()


def render_png(document: ReportDocument) -> bytes:
    from PIL import Image, ImageDraw, ImageFont
    width, margin, line_height = 1400, 70, 30
    font_path = os.getenv("PRIMEFLOW_REPORT_FONT_PATH", r"C:\Windows\Fonts\seguiemj.ttf")
    fallback = r"C:\Windows\Fonts\arial.ttf"
    try:
        font = ImageFont.truetype(font_path if os.path.exists(font_path) else fallback, 22)
        heading = ImageFont.truetype(fallback, 30)
    except OSError:
        font = heading = ImageFont.load_default()
    lines: list[tuple[str, Any]] = [(document.subject, heading), ("", font)]
    max_chars = 95
    import textwrap
    for raw in render_plain_text(document).splitlines()[3:]:
        wrapped = textwrap.wrap(raw, width=max_chars, replace_whitespace=False, drop_whitespace=False) or [""]
        lines.extend((line, font) for line in wrapped)
    height = max(500, margin * 2 + line_height * len(lines))
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    y = margin
    for line, line_font in lines:
        draw.text((margin, y), line, fill="#172033", font=line_font)
        y += line_height + (8 if line_font == heading else 0)
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
                token = await self._token(client)
                response = await client.get(
                    "/api/common-view",
                    params={"week_start": week_day.isoformat(), "freeze_one_h_slots": "true", "max_items_per_bucket": 5000},
                    headers={"Authorization": f"Bearer {token}", "Cache-Control": "no-cache"},
                )
                if response.status_code == 401:
                    self.access_token = None
                    token = await self._token(client)
                    response = await client.get("/api/common-view", params={"week_start": week_day.isoformat(), "freeze_one_h_slots": "true", "max_items_per_bucket": 5000}, headers={"Authorization": f"Bearer {token}", "Cache-Control": "no-cache"})
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

    async def send_verified(self, subject: str, recipients: list[str] | dict[str, list[str]], body: str, html_body: str | None = None) -> dict[str, Any]:
        recipient_map = recipients if isinstance(recipients, dict) else {"to": recipients, "cc": [], "bcc": []}
        all_recipients = sum(recipient_map.values(), [])
        if not recipient_map["to"]:
            raise ValueError("At least one To recipient is required")
        message = EmailMessage()
        message_id = make_msgid(domain=self.sender.rsplit("@", 1)[-1])
        message["From"] = self.sender
        message["To"] = ", ".join(recipient_map["to"])
        message["Subject"] = subject
        message["Message-ID"] = message_id
        if recipient_map["cc"]:
            message["Cc"] = ", ".join(recipient_map["cc"])
        if recipient_map["bcc"]:
            message["Bcc"] = ", ".join(recipient_map["bcc"])
        message.set_content(body)
        if html_body:
            message.add_alternative(html_body, subtype="html")

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
