from __future__ import annotations

import html
import os
import re
from io import BytesIO
from datetime import date
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

from app.services.meetings_report import common_view_item_sort_key, next_working_day
from app.services.primeflow_report import GmailService, PrimeFlowClient


TASK_ROWS = (
    ("oneH", "1H 10:00", "10:00"),
    ("oneH", "1H 11:00", "11:00"),
    ("oneH", "1H 11:50", "11:50"),
    ("oneH", "1H 14:20", "14:20"),
    ("blocked", "BLL\n14:30 - 15:30", None),
    ("oneH", "1H 16:00", "16:00"),
    ("oneH", "1H NO SLOT", ""),
    ("r1", "R1=1H", None),
    ("personal", "P:\nGA 08:15 / 13:15\nDV/LH 10:15 / 14:30", None),
)
MEETING_ROWS = (("external", "TAK EXT"), ("internal", "TAK INT"))
VALID_1H_SLOTS = {"10:00", "11:00", "11:50", "14:20", "16:00"}

# Gmail can remove style blocks from message bodies. Keep the styles that form
# the report grid inline so the received email matches the preview.
TABLE_STYLE = "width:100%;border-collapse:collapse;table-layout:fixed;margin:12px 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.25;color:#000"
CELL_STYLE = "border:1px solid #000;padding:5px;vertical-align:top;text-align:left;overflow-wrap:anywhere;word-break:break-word"
HEADER_STYLE = f"{CELL_STYLE};text-align:center;font-weight:700"
PERSONAL_GA_CELL_STYLE = f"{CELL_STYLE};background-color:#f3e8ff"
PERSONAL_TASK_INITIALS = re.compile(r"^[A-Z]{2,3}(?:\s*[:/]\s*[A-Z]{2,3})*(?=\s|:|/|$)", re.I)
NOTE_MARKERS_RE = re.compile(r"\[\[\s*/?\s*(?:added|done)\s*\]\]", re.I)
STATUS_COLORS = {
    "TODO": "#FFC4ED",
    "IN_PROGRESS": "#FFFF00",
    "WAITING_CONFIRMATION": "#FFEDD5",
    "DONE": "#C4FDC4",
}


def subject_for(target_date: date) -> str:
    return f"1H SHTYPI - {target_date:%d.%m.%Y}"


def _item_date(item: dict[str, Any]) -> date | None:
    raw = item.get("date") or item.get("entryDate") or item.get("entry_date")
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except ValueError:
        return None


def _slot(item: dict[str, Any]) -> str:
    raw = str(item.get("oneHReportSlot") or item.get("one_h_report_slot") or "").strip()
    return raw if raw in VALID_1H_SLOTS else ""


def _first_line(value: Any) -> str:
    return next((line.strip() for line in str(value or "").splitlines() if line.strip()), "")


def _report_text(value: Any) -> str:
    """Remove note-editor markup; recipients must only see the task text."""
    return re.sub(r"\s{2,}", " ", NOTE_MARKERS_RE.sub("", str(value or ""))).strip()


def _task_status(item: dict[str, Any]) -> str:
    raw = str(item.get("status") or item.get("task_status") or item.get("state") or "TODO")
    normalized = raw.strip().upper().replace(" ", "_").replace("-", "_")
    if normalized in {"COMPLETED", "COMPLETE"}:
        return "DONE"
    if normalized in {"TO_DO", "TODO"}:
        return "TODO"
    if normalized in {"INPROGRESS", "IN_PROGRESS"}:
        return "IN_PROGRESS"
    if normalized in {"WAITING", "PENDING_CONFIRMATION", "WAITING_CONFIRMATION"}:
        return "WAITING_CONFIRMATION"
    return normalized if normalized in STATUS_COLORS else "TODO"


def _task_cell_style(item: dict[str, Any], *, personal: bool) -> tuple[str, str]:
    """GA personal cells remain purple; otherwise colour by the task's status."""
    if personal and _is_personal_task_for_ga(item):
        return PERSONAL_GA_CELL_STYLE, "#f3e8ff"
    color = STATUS_COLORS[_task_status(item)]
    return f"{CELL_STYLE};background-color:{color}", color


def _initials(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        return ""
    if re.fullmatch(r"[A-Za-z]{1,4}", cleaned):
        return cleaned.upper()
    return "".join(part[0] for part in re.split(r"\s+", cleaned) if part).upper()


def _assignees(item: dict[str, Any]) -> list[str]:
    raw = item.get("assignees")
    if not isinstance(raw, list) or not raw:
        raw = str(item.get("person") or item.get("owner") or "").split(",")
    result: list[str] = []
    for value in raw:
        label = _initials(str(value or ""))
        if label and label not in result:
            result.append(label)
    return result


def _task_title(item: dict[str, Any], *, personal: bool) -> str:
    title = _report_text(_first_line(item.get("title")))
    if personal:
        return title
    title = re.sub(r"^[A-Z]{1,4}(?:/[A-Z]{1,4})*:\s*", "", title)
    owners = _assignees(item)
    return f"{'/'.join(owners)}: {title}" if owners else title


def _is_personal_task_for_ga(item: dict[str, Any]) -> bool:
    """Match the GA-assignee rule used by the P row in Common View printouts."""
    title = _report_text(_first_line(item.get("title")))
    match = PERSONAL_TASK_INITIALS.match(title.strip())
    if match is None:
        return False
    return "GA" in {value.strip().upper() for value in re.split(r"[:/]", match.group(0))}


def _dedupe(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str]] = set()
    for item in items:
        key = (
            _first_line(item.get("title")).casefold(),
            str(item.get("date") or ""),
            _slot(item),
            str(item.get("finishPeriod") or item.get("finish_period") or "").upper(),
        )
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


def _task_rows(items: dict[str, Any], target_date: date) -> list[tuple[str, list[dict[str, Any]], bool]]:
    by_bucket = {
        name: [item for item in values if isinstance(item, dict) and _item_date(item) == target_date]
        for name, values in items.items()
        if isinstance(values, list)
    }
    rows: list[tuple[str, list[dict[str, Any]], bool]] = []
    for bucket, label, requested_slot in TASK_ROWS:
        values = list(by_bucket.get(bucket, []))
        if bucket == "oneH":
            values = [item for item in values if _slot(item) == requested_slot]
        values = _dedupe(values)
        values.sort(key=common_view_item_sort_key)
        rows.append((label, values, bucket == "personal"))
    return rows


def _meeting_rows(items: dict[str, Any], target_date: date) -> list[tuple[str, list[dict[str, Any]]]]:
    rows: list[tuple[str, list[dict[str, Any]]]] = []
    for bucket, label in MEETING_ROWS:
        values = [item for item in items.get(bucket, []) if isinstance(item, dict) and _item_date(item) == target_date]
        values.sort(key=lambda item: (str(item.get("time") or ""), _first_line(item.get("title")).casefold()))
        rows.append((label, values))
    return rows


def _html_table(rows: list[tuple[str, list[dict[str, Any]], bool]], *, meeting: bool = False) -> str:
    header = "Meeting" if meeting else "Tasks"
    label_header = "LLoji" if meeting else "LLoji dhe sloti"
    body: list[str] = []
    for number, (label, values, *rest) in enumerate(rows, 1):
        personal = bool(rest and rest[0])
        chunks = [values[index:index + 6] for index in range(0, len(values), 6)] or [[]]
        for chunk_index, chunk in enumerate(chunks):
            cells: list[str] = []
            for item_index, item in enumerate(chunk):
                value = (
                    f"{_report_text(_first_line(item.get('title')))} {str(item.get('time') or '').strip()}".strip()
                    if meeting
                    else _task_title(item, personal=personal)
                )
                cell_style, color = _task_cell_style(item, personal=personal) if not meeting else (CELL_STYLE, "")
                background = f' bgcolor="{color}"' if color else ""
                cells.append(
                    f'<td{background} style="{cell_style}">{item_index + (chunk_index * 6) + 1}. {html.escape(value)}</td>'
                )
            cells.extend(f'<td style="{CELL_STYLE}"></td>' for _ in range(6 - len(cells)))
            row_header = (
                f'<th rowspan="{len(chunks)}" style="{CELL_STYLE}">{number}</th>'
                f'<th rowspan="{len(chunks)}" style="{CELL_STYLE}">{html.escape(label).replace(chr(10), "<br>")}</th>'
                if chunk_index == 0 else ""
            )
            body.append(f"<tr>{row_header}{''.join(cells)}</tr>")
    return (
        f'<table role="presentation" width="100%" border="1" cellpadding="0" cellspacing="0" style="{TABLE_STYLE}">'
        '<colgroup><col width="4%"><col width="9%"><col width="14.5%" span="6"></colgroup>'
        f'<thead><tr><th style="{HEADER_STYLE}">NR</th><th style="{HEADER_STYLE}">{label_header}</th>'
        f'<th colspan="6" style="{HEADER_STYLE}">{header}</th></tr></thead>'
        f"<tbody>{''.join(body)}</tbody></table>"
    )


def _excel_table_attachment(
    task_rows: list[tuple[str, list[dict[str, Any]], bool]],
    meeting_rows: list[tuple[str, list[dict[str, Any]], bool]],
    target_date: date,
) -> tuple[str, bytes, str]:
    """Create the same printable grid as an XLSX attachment for email recipients."""
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "1H SHTYPI"
    sheet.merge_cells("A1:H1")
    title_cell = sheet["A1"]
    title_cell.value = f"1H SHTYPI - {target_date:%d.%m.%Y}"
    title_cell.font = Font(bold=True, size=14)
    title_cell.alignment = Alignment(horizontal="center")

    border = Border(
        left=Side(style="thin", color="000000"), right=Side(style="thin", color="000000"),
        top=Side(style="thin", color="000000"), bottom=Side(style="thin", color="000000"),
    )
    header_fill = PatternFill("solid", fgColor="EAF0FF")
    fills = {
        status: PatternFill("solid", fgColor=color.removeprefix("#"))
        for status, color in STATUS_COLORS.items()
    }
    ga_fill = PatternFill("solid", fgColor="F3E8FF")
    headers = ["NR", "LLoji dhe sloti", "Task 1", "Task 2", "Task 3", "Task 4", "Task 5", "Task 6"]

    def write_section(
        rows: list[tuple[str, list[dict[str, Any]], bool]], *, meeting: bool, row_number: int
    ) -> int:
        section_headers = ["NR", "LLoji", "Meeting 1", "Meeting 2", "Meeting 3", "Meeting 4", "Meeting 5", "Meeting 6"] if meeting else headers
        for column, value in enumerate(section_headers, 1):
            cell = sheet.cell(row_number, column, value)
            cell.font = Font(bold=True)
            cell.fill = header_fill
            cell.border = border
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        row_number += 1
        for number, (label, values, personal) in enumerate(rows, 1):
            chunks = [values[index:index + 6] for index in range(0, len(values), 6)] or [[]]
            first_row = row_number
            for chunk_index, chunk in enumerate(chunks):
                if chunk_index == 0:
                    sheet.cell(row_number, 1, number)
                    sheet.cell(row_number, 2, label)
                for item_index, item in enumerate(chunk, 3):
                    value = (
                        f"{_report_text(_first_line(item.get('title')))} {str(item.get('time') or '').strip()}".strip()
                        if meeting else _task_title(item, personal=personal)
                    )
                    cell = sheet.cell(row_number, item_index, f"{item_index - 2 + chunk_index * 6}. {value}")
                    if not meeting:
                        cell.fill = ga_fill if personal and _is_personal_task_for_ga(item) else fills[_task_status(item)]
                for column in range(1, 9):
                    cell = sheet.cell(row_number, column)
                    cell.border = border
                    cell.alignment = Alignment(vertical="top", wrap_text=True)
                row_number += 1
            if len(chunks) > 1:
                sheet.merge_cells(start_row=first_row, start_column=1, end_row=row_number - 1, end_column=1)
                sheet.merge_cells(start_row=first_row, start_column=2, end_row=row_number - 1, end_column=2)
        return row_number

    next_row = write_section(task_rows, meeting=False, row_number=3)
    write_section(meeting_rows, meeting=True, row_number=next_row + 1)
    widths = [6, 22, 29, 29, 29, 29, 29, 29]
    for index, width in enumerate(widths, 1):
        sheet.column_dimensions[chr(64 + index)].width = width
    sheet.freeze_panes = "C4"

    output = BytesIO()
    workbook.save(output)
    return (
        f"1H_SHTYPI_{target_date:%Y-%m-%d}.xlsx",
        output.getvalue(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


async def build_tomorrow_print_report(
    delivery_date: date, *, include_attachment: bool = False
) -> dict[str, Any]:
    target_date = next_working_day(delivery_date)
    base_url = os.getenv("PRIMEFLOW_API_BASE_URL")
    if not base_url:
        raise RuntimeError("PRIMEFLOW_API_BASE_URL is required to generate 1H SHTYPI")
    client = PrimeFlowClient(
        base_url.rstrip("/"), os.getenv("PRIMEFLOW_EMAIL"), os.getenv("PRIMEFLOW_PASSWORD"), os.getenv("PRIMEFLOW_ACCESS_TOKEN"),
    )
    payload = await client.common_view(target_date)
    items = payload.get("items") or {}
    task_rows = _task_rows(items, target_date)
    meeting_rows = [(label, values, False) for label, values in _meeting_rows(items, target_date)]
    report_date = target_date.strftime("%d.%m.%Y")
    html_body = f"""<!doctype html><html><body style=\"margin:0;color:#000;font-family:Arial,sans-serif\">
<div style=\"text-align:center;font-size:20px;font-weight:700;margin:0 0 12px\">1H SHTYPI — {report_date}</div>
{_html_table(task_rows)}{_html_table(meeting_rows, meeting=True)}</body></html>"""
    plain_rows = [f"1H SHTYPI - {report_date}", "", "TASKS"]
    for label, values, personal in task_rows:
        plain_rows.append(f"{label}: " + "; ".join(_task_title(item, personal=personal) for item in values))
    plain_rows.append("")
    plain_rows.append("MEETINGS")
    for label, values, _ in meeting_rows:
        plain_rows.append(
            f"{label}: " + "; ".join(
                f"{_report_text(_first_line(item.get('title')))} {item.get('time') or ''}".strip()
                for item in values
            )
        )
    report: dict[str, Any] = {
        "subject": subject_for(target_date),
        "target_date": target_date.isoformat(),
        "html": html_body,
        "plain_text": "\n".join(plain_rows),
    }
    if include_attachment:
        report["attachments"] = [_excel_table_attachment(task_rows, meeting_rows, target_date)]
    return report


async def send_tomorrow_print_report(report: dict[str, Any], recipients: dict[str, list[str]]) -> dict[str, Any]:
    return await GmailService().send_verified(
        report["subject"], recipients, report["plain_text"], report["html"], attachments=report.get("attachments")
    )
