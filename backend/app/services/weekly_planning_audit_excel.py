from __future__ import annotations

import io

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.services.weekly_planning_audit import REPORT_VERSION, WeeklyPlanningAuditReport


SHEET_NAMES = [
    "RAPORTI FINAL",
    "DETAJET E GABIMEVE",
    "TITUJT - SHKURTESAT PX",
    "SHKURTESAT PX",
    "DËRGIMI AUTOMATIK",
]
HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
HEADER_FONT = Font(color="FFFFFF", bold=True)
SEVERITY_FILLS = {
    "CRITICAL": PatternFill("solid", fgColor="C00000"),
    "HIGH": PatternFill("solid", fgColor="F4B183"),
    "MEDIUM": PatternFill("solid", fgColor="FFE699"),
    "LOW": PatternFill("solid", fgColor="DDEBF7"),
}


def report_filename(report: WeeklyPlanningAuditReport) -> str:
    return (
        f"Raporti_PF_PLNF_JAV_{report.week_start:%d-%m-%Y}_{report.week_end:%d-%m-%Y}_"
        f"{report.slot.replace(':', '-')}_{report.generated_at:%d-%m-%Y}.xlsx"
    )


def report_subject(report: WeeklyPlanningAuditReport) -> str:
    week_range = f"{report.week_start:%d.%m.%Y}–{report.week_end:%d.%m.%Y}"
    return f"Kontrolli {report.slot} | PLNF JAV {week_range} | Raporti {report.generated_at:%d.%m.%Y}"


def report_email_body(report: WeeklyPlanningAuditReport) -> str:
    critical = sum(item.severity == "CRITICAL" for item in report.errors)
    high = sum(item.severity == "HIGH" for item in report.errors)
    return (
        "Përshëndetje,\n\n"
        "Bashkëngjitur është raporti aktual i kontrollit të planifikimit javor në PrimeFlow "
        f"për javën {report.week_start:%d.%m.%Y}–{report.week_end:%d.%m.%Y}.\n\n"
        f"Raporti është gjeneruar nga gjendja aktuale në PrimeFlow në orën {report.slot}.\n\n"
        "Përmbledhje:\n"
        f"- Persona të përfshirë: {len(report.people)}\n"
        f"- Persona të përjashtuar për PV të plotë: {len(report.excluded_full_leave)}\n"
        f"- Gabime gjithsej: {len(report.errors)}\n"
        f"- Gabime kritike: {critical}\n"
        f"- Gabime të larta: {high}\n\n"
        "Me respekt,\nPrimeFlow"
    )


def _style_sheet(ws, *, severity_column: int | None = None) -> None:
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for cell in ws[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
        if severity_column:
            severity = str(row[severity_column - 1].value or "").upper()
            if severity in SEVERITY_FILLS:
                row[severity_column - 1].fill = SEVERITY_FILLS[severity]
                if severity == "CRITICAL":
                    row[severity_column - 1].font = Font(color="FFFFFF", bold=True)
    for column_cells in ws.columns:
        values = [str(cell.value or "") for cell in column_cells]
        width = min(max(12, max((len(value) for value in values), default=0) + 2), 55)
        ws.column_dimensions[get_column_letter(column_cells[0].column)].width = width


def build_weekly_planning_audit_workbook(
    report: WeeklyPlanningAuditReport,
    *,
    recipients: dict[str, list[str]],
    run_id: str,
    delivery_status: str = "Generated, not sent",
    message_id: str | None = None,
    attempt_number: int = 0,
) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    for name in SHEET_NAMES:
        workbook.create_sheet(name)

    final = workbook["RAPORTI FINAL"]
    final.append([
        "Nr.", "Personi", "Departamenti", "Statusi PV", "Fokusi kryesor i javës",
        "Numri i detyrave", "Numri i gabimeve", "Gabime kritike", "Gabime të larta",
        "Vlerësimi", "Veprimi i kërkuar",
    ])
    for index, person in enumerate(report.people, 1):
        final.append([
            index, person.employee, person.department, person.leave_status, person.focus,
            person.task_count, person.error_count, person.critical_count, person.high_count,
            person.assessment, person.required_action,
        ])
    _style_sheet(final)

    details = workbook["DETAJET E GABIMEVE"]
    details.append([
        "Nr.", "Personi", "Departamenti", "Data", "Task ID", "Titulli aktual",
        "Problemi konkret", "Titulli i propozuar", "Korrigjimi", "Kodi i rregullit",
        "Çfarë kalon në Description/Notes", "Ashpërsia", "Fokusi i javës", "Burimi",
    ])
    for index, error in enumerate(report.errors, 1):
        details.append([
            index, error.employee, error.department, error.task_date, error.task_id,
            error.current_title, error.problem, error.proposed_title, error.correction,
            error.rule_code, error.move_to_notes, error.severity, error.weekly_focus, error.source,
        ])
        if error.task_date:
            details.cell(details.max_row, 4).number_format = "DD.MM.YYYY"
    _style_sheet(details, severity_column=12)

    cleanup = workbook["TITUJT - SHKURTESAT PX"]
    cleanup.append([
        "Personi", "Task ID", "Titulli aktual", "Problemi i titullit",
        "Titulli i propozuar", "Çfarë kalon në Description/Notes",
        "Shkurtesat e përdorura", "Burimi i rregullit",
    ])
    for item in report.title_cleanup:
        cleanup.append([
            item["employee"], item["task_id"], item["current_title"], item["title_problem"],
            item["proposed_title"], item["move_to_notes"], item["used_abbreviations"],
            item["rule_source"],
        ])
    _style_sheet(cleanup)

    abbreviations = workbook["SHKURTESAT PX"]
    abbreviations.append(["Shkurtesa", "Definicioni", "Versioni", "Burimi", "Data e përditësimit"])
    for abbreviation, definition in report.abbreviations.items():
        abbreviations.append([
            abbreviation, definition, report.abbreviation_version,
            report.abbreviation_source, report.abbreviation_updated_at,
        ])
    _style_sheet(abbreviations)

    delivery = workbook["DËRGIMI AUTOMATIK"]
    delivery.append([
        "Java e raportuar", "Data dhe ora e gjenerimit", "Kontrolli", "Timezone",
        "Marrësit", "Statusi i dërgimit", "Message ID", "Numri i tentimit",
        "Report run ID", "Versioni i raportit", "Mënyra e analizës", "Modeli AI",
    ])
    recipient_text = "; ".join(
        f"{kind.upper()}: {', '.join(values)}" for kind, values in recipients.items() if values
    )
    delivery.append([
        f"{report.week_start:%d.%m.%Y}–{report.week_end:%d.%m.%Y}",
        report.generated_at.replace(tzinfo=None),
        report.slot,
        report.timezone,
        recipient_text,
        delivery_status,
        message_id or "",
        attempt_number,
        run_id,
        REPORT_VERSION,
        "AI + rregulla deterministe" if report.ai_status == "used" else "Rregulla deterministe (AI fallback)",
        report.ai_model or "",
    ])
    delivery.cell(2, 2).number_format = "DD.MM.YYYY HH:MM"
    _style_sheet(delivery)

    output = io.BytesIO()
    workbook.save(output)
    # Re-open before returning so corrupt workbooks fail generation rather than download.
    output.seek(0)
    verified = load_workbook(output, read_only=True, data_only=False)
    if verified.sheetnames != SHEET_NAMES:
        raise ValueError("Weekly planning audit workbook has an invalid sheet layout")
    verified.close()
    return output.getvalue()


def update_weekly_planning_audit_delivery_metadata(
    workbook_bytes: bytes,
    *,
    delivery_status: str,
    message_id: str | None,
    attempt_number: int,
) -> bytes:
    workbook = load_workbook(io.BytesIO(workbook_bytes))
    delivery = workbook["DËRGIMI AUTOMATIK"]
    delivery.cell(2, 6, delivery_status)
    delivery.cell(2, 7, message_id or "")
    delivery.cell(2, 8, attempt_number)
    output = io.BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()
