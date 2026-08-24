from __future__ import annotations

import html
import os
import re
from io import BytesIO
from datetime import date, datetime
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
    ("blocked", "BLL\n14:30 - 15:30\nRAP 15:50", None),
    ("oneH", "1H 15:50", "15:50"),
    ("oneH", "1H NO SLOT", ""),
    ("important", "DEADLINE / 08:00", None),
    ("r1", "R1=1H", None),
    ("personal", "P:\nGA 08:15 / 13:15\n\nDV/LH 10:15 / 14:30", None),
)
MEETING_ROWS = (("external", "TAK EXT"), ("internal", "TAK INT"))
VALID_1H_SLOTS = {"10:00", "11:00", "11:50", "14:20", "15:50"}
ONE_H_BOARD_CHECKLIST = (
    ("Slotin paraprak/aktual", ""),
    ("A ke filluar me slotin aktual?", ""),
    ("Nese jo, kur?", ""),
    ("A kryhet sot?", ""),
    ("A kryhet kete jave?", ""),
    ("A arrihet RLZ javor?", ""),
    ("Done? / Strikes? / Notes te reja? Data? AM/PM? Kujt?", ""),
    ("BZ Notes", "Secili i lexon vet para BZ me GA"),
)
ONE_H_STAFF_CHECKLIST = (
    ("Hap doc dhe det", ""),
    ("Share screen side by side DET/REZULTATIN", ""),
    ("Sqaro slotin paraprak pastaj aktual", ""),
    ("BZ Det nga Stafi per GA", "Komunikimi GA temas Det nga Stafi/ KA email"),
)

# Gmail can remove style blocks from message bodies. Keep the styles that form
# the report grid inline so the received email matches the preview.
TABLE_STYLE = "width:100%;border-collapse:collapse;table-layout:fixed;margin:12px 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.25;color:#000"
CELL_STYLE = "border:1px solid #000;padding:5px;vertical-align:top;text-align:left;overflow-wrap:anywhere;word-break:break-word"
HEADER_STYLE = f"{CELL_STYLE};text-align:center;font-weight:700"
SLOT_DIVIDER_STYLE = "border-top:2px solid #111827"
INTRA_SLOT_DIVIDER_STYLE = "border-top:1px solid #cbd5e1"
SLOT_LABEL_STYLE = f"{CELL_STYLE};font-weight:700"
PERSONAL_GA_COLOR = "#D8B4FE"
PERSONAL_GA_CELL_STYLE = f"{CELL_STYLE};background-color:{PERSONAL_GA_COLOR}"
PERSONAL_ROW_LABEL_STYLE = (
    f"{CELL_STYLE};font-size:10px;line-height:1.15;white-space:pre-line;"
    "overflow-wrap:normal;word-break:normal"
)
DEADLINE_COLOR = "#DC2626"
EIGHT_AM_BORDER_COLOR = "#DC2626"
NON_ROUTINE_MEETING_BORDER_COLOR = "#2563EB"
PERSONAL_TASK_INITIALS = re.compile(r"^[A-Z]{2,3}(?:\s*[:/]\s*[A-Z]{2,3})*(?=\s|:|/|$)", re.I)
NOTE_MARKERS_RE = re.compile(r"\[\[\s*/?\s*(?:added|done)\s*\]\]", re.I)
EIGHT_AM_MARKER_RE = re.compile(r"\b0?8:00\b")
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
    """Deadline tasks are red; 08:00 tasks receive a red border."""
    if bool(item.get("is_deadline_important") or item.get("isDeadlineImportant")):
        color = DEADLINE_COLOR
    elif personal and _is_personal_task_for_ga(item):
        color = PERSONAL_GA_COLOR
    else:
        color = STATUS_COLORS[_task_status(item)]
    border = f";border:2px solid {EIGHT_AM_BORDER_COLOR}" if _is_eight_am_task(item) else ""
    text_color = ";color:#fff;font-weight:700" if color == DEADLINE_COLOR else ""
    return f"{CELL_STYLE};background-color:{color}{border}{text_color}", color


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


def _is_eight_am_task(item: dict[str, Any]) -> bool:
    title = " ".join(str(item.get(key) or "") for key in ("title", "task_title"))
    if EIGHT_AM_MARKER_RE.search(title):
        return True
    raw_due_date = item.get("due_date") or item.get("dueDate")
    if isinstance(raw_due_date, datetime):
        return raw_due_date.hour == 8 and raw_due_date.minute == 0
    match = re.search(r"T08:00(?::00)?", str(raw_due_date or ""))
    return bool(match)


def _task_due_day(item: dict[str, Any]) -> date | None:
    raw = (
        item.get("due_date")
        or item.get("dueDate")
        or item.get("deadline_date")
        or item.get("deadlineDate")
    )
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    try:
        return date.fromisoformat(str(raw or "")[:10])
    except ValueError:
        return None


def _task_badges_html(item: dict[str, Any], report_date: date | None) -> str:
    badges: list[str] = []
    base_style = (
        "display:inline-block;float:right;margin:0 0 3px 4px;padding:2px 5px;border:2px solid #111827;"
        "background-color:#fff;color:#111827;font-family:Arial,sans-serif;font-size:10px;"
        "font-weight:800;line-height:1.1;white-space:nowrap;"
    )
    if _is_eight_am_task(item):
        badges.append(f'<span data-task-badge="08:00" style="{base_style}">08:00</span>')
    if bool(item.get("is_deadline_important") or item.get("isDeadlineImportant")):
        due_day = _task_due_day(item)
        if due_day:
            due_today = report_date is not None and due_day == report_date
            style = base_style
            label = f"DUE {due_day:%d.%m.%Y}"
            if due_today:
                style += "font-size:13px;font-weight:900;border-width:3px;background-color:#FEF08A;"
                label = f"DUE TODAY {due_day:%d.%m.%Y}"
            badges.append(
                f'<span data-task-badge="due-date" data-due-today="{str(due_today).lower()}" '
                f'style="{style}">{label}</span>'
            )
    return "".join(badges)


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
        # Completed work belongs at the end of its slot so unfinished work is
        # immediately visible in the printed report.
        values.sort(key=lambda item: (_task_status(item) == "DONE", common_view_item_sort_key(item)))
        rows.append((label, values, bucket == "personal"))
    return rows


def _meeting_rows(items: dict[str, Any], target_date: date) -> list[tuple[str, list[dict[str, Any]]]]:
    rows: list[tuple[str, list[dict[str, Any]]]] = []
    for bucket, label in MEETING_ROWS:
        values = [item for item in items.get(bucket, []) if isinstance(item, dict) and _item_date(item) == target_date]
        values.sort(key=lambda item: (str(item.get("time") or ""), _first_line(item.get("title")).casefold()))
        rows.append((label, values))
    return rows


def _is_non_routine_meeting(item: dict[str, Any]) -> bool:
    recurrence = str(item.get("recurrence_type") or item.get("recurrenceType") or "").strip().lower()
    return recurrence not in {"daily", "weekly"}


def _one_h_checklists_html() -> str:
    """The two preparation checklists shown above every 1H Shtypi task grid."""

    def checklist(title: str, questions: tuple[tuple[str, str], ...], *, board: bool = False) -> str:
        separators = (
            '<span style="font-size:20px;font-weight:900;color:#111827;line-height:12px;"> / </span>'
        )
        question_text = separators.join(
            f'<strong>{index}. {html.escape(question)}</strong>'
            + (f' <span style="color:#475569;">({html.escape(description)})</span>' if description else "")
            for index, (question, description) in enumerate(questions, 1)
        )
        board_marker = ' data-board-checklist-columns="true"' if board else ""
        return (
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
            f'data-compact-checklist-row="true"{board_marker} style="width:100%;border-collapse:collapse;">'
            '<tr><th style="background-color:#eef2ff;border-left:5px solid #2563eb;padding:10px 12px;'
            f'font-family:Arial,sans-serif;font-size:14px;text-align:left;">{html.escape(title)}</th></tr>'
            '<tr><td style="border:1px solid #64748b;padding:8px 10px;font-family:Arial,sans-serif;'
            f'font-size:12px;line-height:1.45;">{question_text}</td></tr></table>'
        )

    return (
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
        'data-one-h-checklist-columns="true" style="width:100%;border-collapse:collapse;margin:0 0 14px;">'
        '<tr>'
        '<td width="50%" valign="top" style="width:50%;padding:0 6px 0 0;vertical-align:top;">'
        f"{checklist('STAFF - HAPAT PER 1H', ONE_H_STAFF_CHECKLIST)}"
        '</td>'
        '<td width="50%" valign="top" style="width:50%;padding:0 0 0 6px;vertical-align:top;">'
        f"{checklist('PYETJET PER 1H - BORD', ONE_H_BOARD_CHECKLIST, board=True)}"
        '</td>'
        '</tr></table>'
    )


def _html_table(
    rows: list[tuple[str, list[dict[str, Any]], bool]], *, meeting: bool = False, report_date: date | None = None
) -> str:
    header = "MEETING" if meeting else "TASK"
    label_header = "LLOJI" if meeting else "LLOJI DHE SLOTI"
    body: list[str] = []
    for number, (label, values, *rest) in enumerate(rows, 1):
        personal = bool(rest and rest[0])
        chunks = [values[index:index + 6] for index in range(0, len(values), 6)] or [[]]
        for chunk_index, chunk in enumerate(chunks):
            row_divider_style = INTRA_SLOT_DIVIDER_STYLE if chunk_index else SLOT_DIVIDER_STYLE
            cells: list[str] = []
            for item_index, item in enumerate(chunk):
                value = (
                    f"{_report_text(_first_line(item.get('title')))} {str(item.get('time') or '').strip()}".strip()
                    if meeting
                    else _task_title(item, personal=personal)
                )
                if meeting:
                    cell_style = (
                        f"{CELL_STYLE};border:2px solid {NON_ROUTINE_MEETING_BORDER_COLOR}"
                        if _is_non_routine_meeting(item) else CELL_STYLE
                    )
                    color = ""
                else:
                    cell_style, color = _task_cell_style(item, personal=personal)
                cell_style = f"{cell_style};{row_divider_style}"
                background = f' bgcolor="{color}"' if color else ""
                badges = "" if meeting else _task_badges_html(item, report_date)
                cells.append(
                    f'<td{background} style="{cell_style}">{badges}'
                    f'{item_index + (chunk_index * 6) + 1}. {html.escape(value)}</td>'
                )
            cells.extend(f'<td style="{CELL_STYLE};{row_divider_style}"></td>' for _ in range(6 - len(cells)))
            row_header = (
                f'<th rowspan="{len(chunks)}" style="{SLOT_LABEL_STYLE};{row_divider_style}">{number}</th>'
                f'<th rowspan="{len(chunks)}" style="{PERSONAL_ROW_LABEL_STYLE if personal else SLOT_LABEL_STYLE};{row_divider_style}">{html.escape(label).replace(chr(10), "<br>")}</th>'
                if chunk_index == 0 else ""
            )
            body.append(f"<tr>{row_header}{''.join(cells)}</tr>")
    return (
        f'<table role="presentation" width="100%" border="1" cellpadding="0" cellspacing="0" style="{TABLE_STYLE}">'
        '<colgroup><col width="4%"><col width="9%"><col width="14.5%" span="6"></colgroup>'
        f'<thead><tr><th style="{HEADER_STYLE}">NR</th><th style="{HEADER_STYLE}">{label_header}</th>'
        + "".join(f'<th style="{HEADER_STYLE}">{header} {index}</th>' for index in range(1, 7))
        + '</tr></thead>'
        f"<tbody>{''.join(body)}</tbody></table>"
    )


def _excel_table_attachment(
    task_rows: list[tuple[str, list[dict[str, Any]], bool]],
    meeting_rows: list[tuple[str, list[dict[str, Any]], bool]],
    target_date: date,
    *,
    include_meetings: bool = True,
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
    slot_divider_border = Border(
        left=Side(style="thin", color="000000"), right=Side(style="thin", color="000000"),
        top=Side(style="medium", color="111827"), bottom=Side(style="thin", color="000000"),
    )
    intra_slot_divider_border = Border(
        left=Side(style="thin", color="000000"), right=Side(style="thin", color="000000"),
        top=Side(style="thin", color="CBD5E1"), bottom=Side(style="thin", color="000000"),
    )
    header_fill = PatternFill("solid", fgColor="EAF0FF")
    fills = {
        status: PatternFill("solid", fgColor=color.removeprefix("#"))
        for status, color in STATUS_COLORS.items()
    }
    ga_fill = PatternFill("solid", fgColor=PERSONAL_GA_COLOR.removeprefix("#"))
    deadline_fill = PatternFill("solid", fgColor=DEADLINE_COLOR.removeprefix("#"))
    eight_am_border = Border(
        left=Side(style="medium", color=EIGHT_AM_BORDER_COLOR.removeprefix("#")),
        right=Side(style="medium", color=EIGHT_AM_BORDER_COLOR.removeprefix("#")),
        top=Side(style="medium", color=EIGHT_AM_BORDER_COLOR.removeprefix("#")),
        bottom=Side(style="medium", color=EIGHT_AM_BORDER_COLOR.removeprefix("#")),
    )
    non_routine_meeting_border = Border(
        left=Side(style="medium", color=NON_ROUTINE_MEETING_BORDER_COLOR.removeprefix("#")),
        right=Side(style="medium", color=NON_ROUTINE_MEETING_BORDER_COLOR.removeprefix("#")),
        top=Side(style="medium", color=NON_ROUTINE_MEETING_BORDER_COLOR.removeprefix("#")),
        bottom=Side(style="medium", color=NON_ROUTINE_MEETING_BORDER_COLOR.removeprefix("#")),
    )
    headers = ["NR", "LLOJI DHE SLOTI", "TASK 1", "TASK 2", "TASK 3", "TASK 4", "TASK 5", "TASK 6"]

    def write_checklists(row_number: int) -> int:
        """Write each preparation list as a title row plus one compact content row."""
        checklist_fill = PatternFill("solid", fgColor="EEF2FF")
        for start_column, end_column, title, questions in (
            (1, 4, "STAFF - HAPAT PER 1H", ONE_H_STAFF_CHECKLIST),
            (5, 8, "PYETJET PER 1H - BORD", ONE_H_BOARD_CHECKLIST),
        ):
            sheet.merge_cells(start_row=row_number, start_column=start_column, end_row=row_number, end_column=end_column)
            title_cell = sheet.cell(row_number, start_column, title)
            title_cell.fill = checklist_fill
            title_cell.font = Font(bold=True, size=11)
            title_cell.alignment = Alignment(vertical="center")
            title_cell.border = border
            sheet.merge_cells(
                start_row=row_number + 1,
                start_column=start_column,
                end_row=row_number + 1,
                end_column=end_column,
            )
            question_cell = sheet.cell(
                row_number + 1,
                start_column,
                " / ".join(
                    f"{index}. {question}" + (f" ({description})" if description else "")
                    for index, (question, description) in enumerate(questions, 1)
                ),
            )
            question_cell.font = Font(bold=True, size=10)
            question_cell.alignment = Alignment(vertical="center", wrap_text=True)
            question_cell.border = border
        sheet.row_dimensions[row_number + 1].height = 72
        return row_number + 2

    def write_section(
        rows: list[tuple[str, list[dict[str, Any]], bool]], *, meeting: bool, row_number: int
    ) -> int:
        section_headers = ["NR", "LLOJI", "MEETING 1", "MEETING 2", "MEETING 3", "MEETING 4", "MEETING 5", "MEETING 6"] if meeting else headers
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
                row_border = intra_slot_divider_border if chunk_index else slot_divider_border
                if chunk_index == 0:
                    sheet.cell(row_number, 1, number)
                    label_cell = sheet.cell(row_number, 2, label)
                    label_cell.font = Font(bold=True, size=10)
                    if personal:
                        label_cell.alignment = Alignment(vertical="top", wrap_text=True)
                for item_index, item in enumerate(chunk, 3):
                    value = (
                        f"{_report_text(_first_line(item.get('title')))} {str(item.get('time') or '').strip()}".strip()
                        if meeting else _task_title(item, personal=personal)
                    )
                    if not meeting:
                        labels: list[str] = []
                        if _is_eight_am_task(item):
                            labels.append("[08:00]")
                        if bool(item.get("is_deadline_important") or item.get("isDeadlineImportant")):
                            due_day = _task_due_day(item)
                            if due_day:
                                due_label = "DUE TODAY" if due_day == target_date else "DUE"
                                labels.append(f"[{due_label} {due_day:%d.%m.%Y}]")
                        if labels:
                            value = f"{' '.join(labels)}\n{value}"
                    cell = sheet.cell(row_number, item_index, f"{item_index - 2 + chunk_index * 6}. {value}")
                    if not meeting:
                        if bool(item.get("is_deadline_important") or item.get("isDeadlineImportant")):
                            cell.fill = deadline_fill
                            cell.font = Font(color="FFFFFF", bold=True)
                            if _task_due_day(item) == target_date:
                                cell.font = Font(color="FFFFFF", bold=True, size=12)
                        else:
                            cell.fill = ga_fill if personal and _is_personal_task_for_ga(item) else fills[_task_status(item)]
                        if _is_eight_am_task(item):
                            cell.border = eight_am_border
                    elif _is_non_routine_meeting(item):
                        cell.border = non_routine_meeting_border
                for column in range(1, 9):
                    cell = sheet.cell(row_number, column)
                    is_highlighted_meeting_cell = (
                        meeting
                        and column >= 3
                        and column - 3 < len(chunk)
                        and _is_non_routine_meeting(chunk[column - 3])
                    )
                    is_eight_am_task_cell = (
                        not meeting
                        and column >= 3
                        and column - 3 < len(chunk)
                        and _is_eight_am_task(chunk[column - 3])
                    )
                    if not is_highlighted_meeting_cell and not is_eight_am_task_cell:
                        cell.border = row_border
                    cell.alignment = Alignment(vertical="top", wrap_text=True)
                row_number += 1
            if len(chunks) > 1:
                sheet.merge_cells(start_row=first_row, start_column=1, end_row=row_number - 1, end_column=1)
                sheet.merge_cells(start_row=first_row, start_column=2, end_row=row_number - 1, end_column=2)
        return row_number

    task_header_row = write_checklists(3)
    next_row = write_section(task_rows, meeting=False, row_number=task_header_row)
    if include_meetings:
        write_section(meeting_rows, meeting=True, row_number=next_row + 1)
    widths = [6, 22, 29, 29, 29, 29, 29, 29]
    for index, width in enumerate(widths, 1):
        sheet.column_dimensions[chr(64 + index)].width = width
    sheet.freeze_panes = f"C{task_header_row + 1}"

    output = BytesIO()
    workbook.save(output)
    return (
        f"1H_SHTYPI_{target_date:%Y-%m-%d}.xlsx",
        output.getvalue(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


async def _build_print_report(
    target_date: date, *, include_attachment: bool = False, include_meetings: bool = True
) -> dict[str, Any]:
    base_url = os.getenv("PRIMEFLOW_API_BASE_URL")
    if not base_url:
        raise RuntimeError("PRIMEFLOW_API_BASE_URL is required to generate 1H SHTYPI")
    client = PrimeFlowClient(
        base_url.rstrip("/"), os.getenv("PRIMEFLOW_EMAIL"), os.getenv("PRIMEFLOW_PASSWORD"), os.getenv("PRIMEFLOW_ACCESS_TOKEN"),
    )
    payload = await client.common_view(target_date)
    items = payload.get("items") or {}
    task_rows = _task_rows(items, target_date)
    meeting_rows = (
        [(label, values, False) for label, values in _meeting_rows(items, target_date)]
        if include_meetings else []
    )
    report_date = target_date.strftime("%d.%m.%Y")
    html_body = f"""<!doctype html><html><body style=\"margin:0;color:#000;font-family:Arial,sans-serif\">
<div style=\"text-align:center;font-size:20px;font-weight:700;margin:0 0 12px\">1H SHTYPI — {report_date}</div>
{_one_h_checklists_html()}{_html_table(task_rows, report_date=target_date)}{_html_table(meeting_rows, meeting=True, report_date=target_date) if include_meetings else ''}</body></html>"""
    plain_rows = [
        f"1H SHTYPI - {report_date}",
        "",
        "PYETJET PER 1H - BORD",
        *(
            f"{index}. {question}" + (f" ({description})" if description else "")
            for index, (question, description) in enumerate(ONE_H_BOARD_CHECKLIST, 1)
        ),
        "",
        "STAFF - HAPAT PER 1H",
        *(
            f"{index}. {question}" + (f" ({description})" if description else "")
            for index, (question, description) in enumerate(ONE_H_STAFF_CHECKLIST, 1)
        ),
        "",
        "TASKS",
    ]
    for label, values, personal in task_rows:
        plain_rows.append(f"{label}: " + "; ".join(_task_title(item, personal=personal) for item in values))
    if include_meetings:
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
        report["attachments"] = [
            _excel_table_attachment(
                task_rows, meeting_rows, target_date, include_meetings=include_meetings
            )
        ]
    return report


async def build_tomorrow_print_report(
    delivery_date: date, *, include_attachment: bool = False
) -> dict[str, Any]:
    return await _build_print_report(
        next_working_day(delivery_date), include_attachment=include_attachment, include_meetings=True
    )


async def build_today_print_report(
    report_date: date, *, include_attachment: bool = False
) -> dict[str, Any]:
    """Build the Common View print template using only today's task rows."""
    return await _build_print_report(
        report_date, include_attachment=include_attachment, include_meetings=False
    )


async def send_tomorrow_print_report(report: dict[str, Any], recipients: dict[str, list[str]]) -> dict[str, Any]:
    return await GmailService().send_verified(
        report["subject"], recipients, report["plain_text"], report["html"], attachments=report.get("attachments")
    )
