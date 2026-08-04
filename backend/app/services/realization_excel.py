from __future__ import annotations

import io
import json
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


NAVY = "17365D"
BLUE = "D9EAF7"
GREEN = "C6EFCE"
AMBER = "FFE699"
RED = "F4CCCC"
WHITE = "FFFFFF"
GRAY = "E7E6E6"
LEVEL_COLORS = {
    "A+": "00B050",
    "A": "70AD47",
    "B": "C6E0B4",
    "C": "FFD966",
    "M": "F4B183",
    "D": "F8696B",
    "E": "C00000",
}
THIN = Side(style="thin", color="A6A6A6")


def _value(value: Any) -> str | int | float | bool:
    if value is None:
        return "—"
    if isinstance(value, (str, int, float, bool)):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


def _title(ws, title: str, subtitle: str, width: int) -> None:
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=width)
    ws.cell(1, 1, title)
    ws.cell(1, 1).font = Font(color=WHITE, bold=True, size=16)
    ws.cell(1, 1).fill = PatternFill("solid", fgColor=NAVY)
    ws.cell(1, 1).alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 28
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=width)
    ws.cell(2, 1, subtitle)
    ws.cell(2, 1).font = Font(color="666666", italic=True)
    ws.cell(2, 1).alignment = Alignment(horizontal="center")


def _header(cell, fill: str = NAVY) -> None:
    cell.fill = PatternFill("solid", fgColor=fill)
    cell.font = Font(color=WHITE, bold=True)
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell.border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def _sheet_name(value: str, used: set[str]) -> str:
    base = "".join("-" if char in "[]:*?/\\" else char for char in value)[:31] or "Department"
    candidate = base
    counter = 2
    while candidate in used:
        suffix = f" {counter}"
        candidate = f"{base[:31-len(suffix)]}{suffix}"
        counter += 1
    used.add(candidate)
    return candidate


def build_realization_workbook(
    *,
    week_start: str,
    week_end: str,
    departments: list[dict[str, Any]],
) -> bytes:
    workbook = Workbook()
    summary = workbook.active
    summary.title = "Përmbledhje"
    _title(summary, "RAPORTI I REALIZIMIT JAVOR", f"{week_start} — {week_end}", 10)
    headers = [
        "Departamenti", "Personi", "Planifikuar", "Në kohë", "Me vonesë",
        "Shtesë", "Progresi javor", "Vlerësimi", "Simboli", "Statusi",
    ]
    for column, label in enumerate(headers, 1):
        summary.cell(4, column, label)
        _header(summary.cell(4, column))
    row = 5
    for department in departments:
        for person in department.get("people") or []:
            facts = person.get("facts_json") or {}
            values = [
                department["name"], person["user_name"], person.get("planned_count", 0),
                person.get("completed_on_time_count", 0), person.get("completed_late_count", 0),
                person.get("additional_count", 0), facts.get("weekly_progress_percent", 0) / 100,
                person.get("final_level") or person.get("suggested_level") or "—",
                person.get("final_symbol") or person.get("suggested_symbol") or "—",
                department.get("status", "—"),
            ]
            for column, value in enumerate(values, 1):
                cell = summary.cell(row, column, value)
                cell.border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
                cell.alignment = Alignment(vertical="top", wrap_text=True)
            summary.cell(row, 7).number_format = "0.0%"
            level = str(values[7])
            if level in LEVEL_COLORS:
                summary.cell(row, 8).fill = PatternFill("solid", fgColor=LEVEL_COLORS[level])
                summary.cell(row, 8).font = Font(
                    bold=True, color=WHITE if level in {"A+", "A", "E"} else "000000"
                )
            row += 1
    summary.freeze_panes = "A5"
    summary.auto_filter.ref = f"A4:J{max(4, row - 1)}"
    widths = [22, 24, 13, 12, 12, 10, 16, 12, 10, 14]
    for index, width in enumerate(widths, 1):
        summary.column_dimensions[get_column_letter(index)].width = width

    used_names = {summary.title}
    for department in departments:
        people = department.get("people") or []
        width = max(3, 1 + len(people) * 2)
        ws = workbook.create_sheet(_sheet_name(department["name"], used_names))
        _title(
            ws,
            f"REALIZIMI — {department['name']}",
            f"Java {week_start} — {week_end} | Statusi: {department.get('status', '—')}",
            width,
        )
        ws.cell(4, 1, "Pyetja / Treguesi")
        _header(ws.cell(4, 1))
        for index, person in enumerate(people):
            col = 2 + index * 2
            ws.merge_cells(start_row=4, start_column=col, end_row=4, end_column=col + 1)
            ws.cell(4, col, person["user_name"])
            _header(ws.cell(4, col))
            ws.cell(5, col, "Përgjigjja")
            ws.cell(5, col + 1, "Argumenti / Evidenca")
            _header(ws.cell(5, col), "5B9BD5")
            _header(ws.cell(5, col + 1), "5B9BD5")
        ws.cell(5, 1, "Burimi")
        _header(ws.cell(5, 1), "5B9BD5")

        ordered_keys: list[str] = []
        labels: dict[str, str] = {}
        for person in people:
            for question in (person.get("facts_json") or {}).get("questions") or []:
                key = str(question.get("key") or "")
                if key and key not in ordered_keys:
                    ordered_keys.append(key)
                    labels[key] = question.get("label") or key
        start = 6
        for row_offset, key in enumerate(ordered_keys):
            current_row = start + row_offset
            ws.cell(current_row, 1, labels[key])
            ws.cell(current_row, 1).font = Font(bold=True)
            ws.cell(current_row, 1).fill = PatternFill("solid", fgColor=BLUE)
            for index, person in enumerate(people):
                col = 2 + index * 2
                question = next(
                    (
                        item for item in (person.get("facts_json") or {}).get("questions") or []
                        if item.get("key") == key
                    ),
                    {},
                )
                answer = question.get("final_value")
                if answer is None:
                    answer = question.get("auto_value")
                ws.cell(current_row, col, _value(answer))
                evidence = question.get("evidence_ids") or []
                explanation = str(question.get("explanation") or "")
                note = " | ".join(
                    item for item in [
                        str(question.get("source_status") or "AUTO"),
                        explanation,
                        f"Evidenca: {', '.join(map(str, evidence))}" if evidence else "",
                    ] if item
                )
                ws.cell(current_row, col + 1, note)
                for target in (ws.cell(current_row, col), ws.cell(current_row, col + 1)):
                    target.alignment = Alignment(vertical="top", wrap_text=True)
                    target.border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
            ws.cell(current_row, 1).border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
            ws.row_dimensions[current_row].height = 42

        current_row = start + len(ordered_keys)
        daily_dates = sorted(
            {
                str(item.get("date"))
                for person in people
                for item in (person.get("facts_json") or {}).get("daily_timeline") or []
                if item.get("date")
            }
        )
        for daily_date in daily_dates:
            ws.cell(current_row, 1, f"Progresi ditor — {daily_date}")
            ws.cell(current_row, 1).font = Font(bold=True)
            ws.cell(current_row, 1).fill = PatternFill("solid", fgColor=GREEN)
            for index, person in enumerate(people):
                col = 2 + index * 2
                snapshot = next(
                    (
                        item
                        for item in (person.get("facts_json") or {}).get("daily_timeline") or []
                        if str(item.get("date")) == daily_date
                    ),
                    None,
                )
                if snapshot:
                    ws.cell(current_row, col, float(snapshot.get("weekly_progress_percent") or 0) / 100)
                    ws.cell(current_row, col).number_format = "0.0%"
                    attendance = snapshot.get("attendance") or []
                    ws.cell(
                        current_row,
                        col + 1,
                        "Dita: "
                        f"{snapshot.get('daily_progress_percent', 0)}% | "
                        f"Shtesë: {snapshot.get('additional_count', 0)} | "
                        f"Prezenca: {', '.join(str(item.get('type')) for item in attendance) or 'OK'}",
                    )
                else:
                    ws.cell(current_row, col, "—")
                    ws.cell(current_row, col + 1, "Pa snapshot")
                for target in (ws.cell(current_row, col), ws.cell(current_row, col + 1)):
                    target.alignment = Alignment(vertical="top", wrap_text=True)
                    target.border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
            ws.cell(current_row, 1).border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
            current_row += 1

        project_keys = sorted(
            {
                str(project.get("project_id") or project.get("project_title"))
                for person in people
                for project in (person.get("facts_json") or {}).get("project_progress") or []
            }
        )
        for project_key in project_keys:
            title = next(
                str(project.get("project_title") or "MST/TT")
                for person in people
                for project in (person.get("facts_json") or {}).get("project_progress") or []
                if str(project.get("project_id") or project.get("project_title")) == project_key
            )
            ws.cell(current_row, 1, f"Mesatarja e projektit — {title}")
            ws.cell(current_row, 1).font = Font(bold=True)
            ws.cell(current_row, 1).fill = PatternFill("solid", fgColor=AMBER)
            for index, person in enumerate(people):
                col = 2 + index * 2
                project = next(
                    (
                        item
                        for item in (person.get("facts_json") or {}).get("project_progress") or []
                        if str(item.get("project_id") or item.get("project_title")) == project_key
                    ),
                    None,
                )
                if project:
                    ws.cell(current_row, col, float(project.get("progress_percent") or 0) / 100)
                    ws.cell(current_row, col).number_format = "0.0%"
                    ws.cell(
                        current_row,
                        col + 1,
                        f"{project.get('task_count', 0)} detyra | {project.get('method', '')}",
                    )
                else:
                    ws.cell(current_row, col, "—")
                    ws.cell(current_row, col + 1, "Pa taska në këtë projekt")
                for target in (ws.cell(current_row, col), ws.cell(current_row, col + 1)):
                    target.alignment = Alignment(vertical="top", wrap_text=True)
                    target.border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
            ws.cell(current_row, 1).border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
            current_row += 1

        grade_row = current_row + 1
        ws.cell(grade_row, 1, "Vlerësimi final")
        _header(ws.cell(grade_row, 1))
        for index, person in enumerate(people):
            col = 2 + index * 2
            level = person.get("final_level") or person.get("suggested_level") or "—"
            symbol = person.get("final_symbol") or person.get("suggested_symbol") or "—"
            ws.cell(grade_row, col, level)
            ws.cell(grade_row, col + 1, symbol)
            fill = LEVEL_COLORS.get(str(level), GRAY)
            for target in (ws.cell(grade_row, col), ws.cell(grade_row, col + 1)):
                target.fill = PatternFill("solid", fgColor=fill)
                target.font = Font(bold=True)
                target.alignment = Alignment(horizontal="center")
                target.border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

        ws.freeze_panes = "B6"
        ws.column_dimensions["A"].width = 38
        for index in range(len(people)):
            ws.column_dimensions[get_column_letter(2 + index * 2)].width = 25
            ws.column_dimensions[get_column_letter(3 + index * 2)].width = 38
        ws.sheet_view.showGridLines = False
        ws.auto_filter.ref = f"A5:{get_column_letter(width)}{max(5, grade_row)}"

    evidence = workbook.create_sheet("Evidenca")
    _title(evidence, "REGJISTRI I EVIDENCËS", "Çdo përgjigje duhet të jetë e gjurmueshme", 8)
    evidence_headers = [
        "Departamenti", "Personi", "Lloji", "ID", "Kategoria", "Statusi",
        "Përshkrimi", "Verifikuar",
    ]
    for column, label in enumerate(evidence_headers, 1):
        evidence.cell(4, column, label)
        _header(evidence.cell(4, column))
    row = 5
    for department in departments:
        for person in department.get("people") or []:
            facts = person.get("facts_json") or {}
            for task in facts.get("tasks") or []:
                values = [
                    department["name"], person["user_name"], "TASK",
                    task.get("task_id") or task.get("match_key"), task.get("source_type"),
                    task.get("classification"), task.get("title"), True,
                ]
                for column, value in enumerate(values, 1):
                    evidence.cell(row, column, _value(value))
                row += 1
            for item in facts.get("observations") or []:
                values = [
                    department["name"], person["user_name"], "OBSERVATION", item.get("id"),
                    item.get("category"), item.get("marker"), item.get("comment"),
                    bool(item.get("verified")),
                ]
                for column, value in enumerate(values, 1):
                    evidence.cell(row, column, _value(value))
                row += 1
    evidence.freeze_panes = "A5"
    evidence.auto_filter.ref = f"A4:H{max(4, row - 1)}"
    for index, width in enumerate([22, 24, 14, 38, 20, 20, 55, 12], 1):
        evidence.column_dimensions[get_column_letter(index)].width = width

    guide = workbook.create_sheet("Udhëzuesi")
    _title(guide, "UDHËZUESI I VLERËSIMIT", "Rregulla deterministe, pa vlera monetare", 4)
    for column, label in enumerate(["Niveli", "Simboli", "Kushti", "Evidenca minimale"], 1):
        guide.cell(4, column, label)
        _header(guide.cell(4, column))
    rules = [
        ("A+", "+", "Plani i plotë + të paktën 2 angazhime ekstra të verifikuara", "Taska + observime të verifikuara"),
        ("A", "+", "Plani i plotë + 1 angazhim ekstra i verifikuar", "Taska + observim i verifikuar"),
        ("B", "+", "Plani normal i plotë; pushimi vjetor i plotë = B", "Snapshot + prezenca"),
        ("C", "+/-", "3+ vonesa, përfundim me vonesë ose ndikim i vogël", "Prezenca/task/audit"),
        ("M", "+/-", "Mungesë personale e aprovuar dhe detyrat e mbuluara", "Aprovim + taska"),
        ("D", "-", "Shtyrje pa aprovim, takim i humbur ose ndikim i madh", "Evidencë e verifikuar"),
        ("E", "-", "Pa progres ose 2+ mungesa të papritura", "Progres + prezenca"),
    ]
    for row, rule in enumerate(rules, 5):
        for column, value in enumerate(rule, 1):
            cell = guide.cell(row, column, value)
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            cell.border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
        guide.cell(row, 1).fill = PatternFill("solid", fgColor=LEVEL_COLORS[rule[0]])
        guide.cell(row, 1).font = Font(bold=True)
    for index, width in enumerate([12, 12, 65, 45], 1):
        guide.column_dimensions[get_column_letter(index)].width = width
    guide.freeze_panes = "A5"

    for ws in workbook.worksheets:
        ws.sheet_view.showGridLines = False
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.sheet_properties.pageSetUpPr.fitToPage = True

    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()
