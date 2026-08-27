from __future__ import annotations

import hashlib
import html
import json
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select, text

from app.db import SessionLocal
from app.models.primeflow_report_delivery_run import PrimeFlowReportDeliveryRun
from app.models.primeflow_report_schedule import PrimeFlowReportSchedule
from app.models.primeflow_report_snapshot import PrimeFlowReportSnapshot
from app.services.daily_rlz_compliance import build_daily_rlz_control, tirana_now
from app.services.daily_realization_report import (
    add_optional_ai_narrative,
    build_daily_realization_report,
    report_delta,
)
from app.services.primeflow_report import GmailService
from app.services.primeflow_report_delivery import configured_recipients

REPORT_TYPE = "rlz_daily_control"
SCHEDULE_TYPE = "RLZ_DAILY_CONTROL"
REPORT_SLOT = "16:10"
DEFAULT_VARIANT_TIMES = {"PRECHECK": "16:10", "FINAL": "16:40", "CORRECTION": "17:05"}
FINAL_REQUIRED_RECIPIENTS = ("ga@primexeu.com", "130primex.eu@gmail.com")


def final_recipient_map(recipients: dict[str, list[str]]) -> dict[str, list[str]]:
    """Ensure scheduled FINAL always reaches the mandated manager addresses."""
    result = {key: [] for key in ("to", "cc", "bcc")}
    seen: set[str] = set()
    for key in ("to", "cc", "bcc"):
        for raw in recipients.get(key, []):
            email = str(raw).strip()
            normalized = email.casefold()
            if email and normalized not in seen:
                result[key].append(email)
                seen.add(normalized)
    for email in FINAL_REQUIRED_RECIPIENTS:
        if email.casefold() not in seen:
            result["to"].append(email)
            seen.add(email.casefold())
    return result
TERMINAL = {"SENT", "ALREADY_SENT", "SKIPPED_NO_CHANGES"}


def subject_for(day: date, report_time: str = REPORT_SLOT, variant: str = "PRECHECK") -> str:
    labels = {
        "PRECHECK": "Kontrolli ditor RLZ",
        "FINAL": "Realizimi ditor FINAL",
        "CORRECTION": "Korrigjime të realizimit ditor",
    }
    return f"[PrimeFlow] {labels.get(variant, labels['PRECHECK'])} - {day:%d/%m/%Y} - {report_time}"


def _close_state_reason(status: str) -> str:
    return {
        "NOT_SAVED": "Gjendja për RLZ javor nuk është ruajtur.",
        "CLOSED_EDIT_WINDOW": "Gjendja nuk u ruajt para mbylljes së afatit.",
        "STALE": "Ka ndryshime pas ruajtjes; gjendja duhet ruajtur përsëri për RLZ javor.",
        "SAVED": "Gjendja është ruajtur, por kanë mbetur pika të paplotësuara.",
    }.get(status, "Gjendja për RLZ javor kërkon kontroll.")


def _task_title(title: str) -> str:
    return next((line.strip() for line in title.splitlines() if line.strip()), title)


CLASSIFICATION_LABELS = {
    "REALIZED_AS_PLANNED": "Kryer sipas planit", "IN_PROGRESS": "Në progres",
    "NO_PROGRESS": "Pa progres", "POSTPONED_APPROVED": "Shtyrë · aprovuar",
    "POSTPONED_UNAPPROVED": "Shtyrë · pa aprovuar", "WAITING_CONFIRMATION": "Në pritje konfirmimi",
    "COMPLETED_LATE": "Kryer me vonesë", "COMPLETED_EARLY": "Kryer para kohe",
    "ADDITIONAL_COMPLETED": "Punë shtesë e kryer", "ADDED_DURING_DAY": "Shtuar gjatë ditës",
    "REOPENED": "Rihapur", "REASSIGNED_OUT": "Transferuar", "REASSIGNED_IN": "Transferuar",
}


def _percent(value) -> str:
    return "N/A" if value is None else f"{value}%"


def _deadline_display(task: dict) -> str:
    changes = [row for row in task.get("timeline", []) if row.get("type") in {"POSTPONED", "POSTPONED_AGAIN", "MOVED_BACK_TO_TODAY", "MOVED_EARLIER"}]
    values: list[str] = []
    for row in changes:
        old, new = row.get("old_value"), row.get("new_value")
        if old and (not values or values[-1] != str(old)[:10]):
            values.append(str(old)[:10])
        if new and (not values or values[-1] != str(new)[:10]):
            values.append(str(new)[:10])
    if values:
        return " → ".join(values)
    baseline, current = task.get("planned_due_date"), task.get("due_date")
    return str(current or baseline or "—") if baseline == current or not baseline else f"{baseline} → {current or '—'}"


def _manager_plain(report: dict, report_time: str) -> str:
    summary = report["summary"]
    lines = [
        subject_for(date.fromisoformat(report["day"]), report_time, report["variant"]),
        f"Employees {summary.get('employees_checked', 0)} | Plan {summary.get('original_planned_count', 0)} | "
        f"Done from Plan {summary.get('planned_completed_today_count', 0)} | In Progress {summary.get('in_progress_count', 0)} | "
        f"Postponed {summary.get('postponed_count', 0)} | No Progress {summary.get('no_progress_count', 0)} | "
        f"Extra {summary.get('additional_completed_count', 0)} | Total Completed Today {summary.get('total_completed_today_count', 0)} | "
        f"Plan Realization {_percent(summary.get('raw_plan_realization'))}",
        f"Deadline Today {summary.get('deadlines_today_count', 0)} | Completed {summary.get('deadlines_completed_count', 0)} | "
        f"Postponed {summary.get('deadlines_postponed_count', 0)} | Open {summary.get('deadlines_open_count', 0)} | "
        f"Overdue {summary.get('overdue_open_count', 0)} | Critical Open {summary.get('critical_deadlines_open_count', 0)} | "
        f"Deadline Compliance {_percent(summary.get('deadline_compliance_percentage'))}",
        summary.get("daily_control_state", "CLEAN_DAY"), "",
    ]
    for person in report.get("people", []):
        metrics = person["metrics"]
        lines.extend([
            f"{person['employee']} — {person['department']}",
            f"Plan {metrics['original_planned_count']} | Done {metrics['planned_completed_today_count']} | "
            f"In Progress {metrics['in_progress_count']} | Postponed {metrics['postponed_count']} | "
            f"No Progress {metrics['no_progress_count']} | Extra {metrics['additional_completed_count']} | "
            f"Total Done {metrics['total_completed_today_count']} | Plan RLZ {_percent(metrics['raw_plan_realization'])}",
            f"Deadline Today {metrics['deadlines_today_count']} | Completed {metrics['deadlines_completed_count']} | "
            f"Postponed {metrics['deadlines_postponed_count']} | Open {metrics['deadlines_open_count']} | "
            f"Deadline Compliance {_percent(metrics['deadline_compliance_percentage'])}",
            f"RLZ {person['rlz_close_state']['status']} | Manager Approval {person['manager_approval']['status']} | {person['control_state']}",
        ])
        for task in person.get("tasks", []):
            label = CLASSIFICATION_LABELS.get(task.get("classification"), task.get("classification") or "—")
            lines.append(f"  [{task.get('status')}] {_task_title(task['title'])} — {label}{' · BLL' if task.get('is_bllok') else ''}")
            lines.append(
                f"    Plan {task.get('original_daily_plan') or 'Extra'} | Deadline {_deadline_display(task)} | "
                f"Reason {task.get('reason_label') or ('MUNGON ARSYEJA' if task.get('reason_missing') else '—')} | "
                f"Comment {task.get('comment') or ('MUNGON KOMENTI' if task.get('comment_missing') else '—')} | "
                f"1H {task.get('one_h_report_slot') or '—'} | Approval {task.get('adjustment_status') or '—'}"
            )
        lines.append("")
    return "\n".join(lines)


def _status_color(task: dict) -> str:
    classification = task.get("classification")
    if classification in {"REALIZED_AS_PLANNED", "ADDITIONAL_COMPLETED", "COMPLETED_LATE", "COMPLETED_EARLY"}:
        return "#C4FDC4"
    if classification == "IN_PROGRESS":
        return "#FFFF00"
    if classification == "WAITING_CONFIRMATION":
        return "#FFEDD5"
    if classification in {"POSTPONED_APPROVED", "POSTPONED_UNAPPROVED"}:
        return "#FED7AA"
    return "#FFC4ED"


def _manager_html(report: dict, report_time: str) -> str:
    summary = report["summary"]
    subject = subject_for(date.fromisoformat(report["day"]), report_time, report["variant"])
    kpis = (
        ("EMPLOYEES", summary.get("employees_checked", 0)), ("PLAN", summary.get("original_planned_count", 0)),
        ("DONE FROM PLAN", summary.get("planned_completed_today_count", 0)), ("IN PROGRESS", summary.get("in_progress_count", 0)),
        ("POSTPONED", summary.get("postponed_count", 0)), ("NO PROGRESS", summary.get("no_progress_count", 0)),
        ("EXTRA", summary.get("additional_completed_count", 0)), ("TOTAL DONE", summary.get("total_completed_today_count", 0)),
        ("PLAN REALIZATION", _percent(summary.get("raw_plan_realization"))),
    )
    deadline_kpis = (
        ("DEADLINE TODAY", summary.get("deadlines_today_count", 0)), ("COMPLETED", summary.get("deadlines_completed_count", 0)),
        ("POSTPONED", summary.get("deadlines_postponed_count", 0)), ("OPEN", summary.get("deadlines_open_count", 0)),
        ("OVERDUE", summary.get("overdue_open_count", 0)), ("CRITICAL OPEN", summary.get("critical_deadlines_open_count", 0)),
        ("DEADLINE COMPLIANCE", _percent(summary.get("deadline_compliance_percentage"))),
    )
    def cards(values):
        return "".join(f'<td style="padding:8px;border:3px solid #fff;background:#EFF6FF;text-align:center"><b style="font-size:18px;color:#1D4ED8">{html.escape(str(value))}</b><br><span style="font-size:10px;color:#475569">{html.escape(label)}</span></td>' for label, value in values)
    overview_rows = "".join(
        f'<tr><td style="padding:6px;border:1px solid #CBD5E1;font-weight:700">{html.escape(person["employee"])}</td>'
        f'<td style="padding:6px;border:1px solid #CBD5E1">{html.escape(person["department"])}</td>'
        + "".join(f'<td style="padding:6px;border:1px solid #CBD5E1;text-align:center">{html.escape(str(value))}</td>' for value in (
            person["metrics"]["original_planned_count"], person["metrics"]["planned_completed_today_count"],
            person["metrics"]["in_progress_count"], person["metrics"]["postponed_count"], person["metrics"]["no_progress_count"],
            person["metrics"]["additional_completed_count"], person["metrics"]["total_completed_today_count"],
            _percent(person["metrics"]["raw_plan_realization"]), person["metrics"]["deadlines_today_count"],
            person["metrics"]["deadlines_open_count"], _percent(person["metrics"]["deadline_compliance_percentage"]),
            person["rlz_close_state"]["status"], person["manager_approval"]["status"], person["control_state"],
        )) + '</tr>' for person in report.get("people", [])
    )
    detail = []
    for person in report.get("people", []):
        m = person["metrics"]
        task_rows = []
        for task in person.get("tasks", []):
            classification = CLASSIFICATION_LABELS.get(task.get("classification"), task.get("classification") or "—")
            reason = task.get("reason_label") or ("MUNGON ARSYEJA" if task.get("reason_missing") else "—")
            comment = task.get("comment") or ("MUNGON KOMENTI" if task.get("comment_missing") else "—")
            warning = "#FEE2E2" if task.get("reason_missing") or task.get("comment_missing") or task.get("deadline_is_overdue") else "#FFFFFF"
            deadline_border = "#DC2626" if task.get("deadline_critical") and not task.get("deadline_completed") else "#CBD5E1"
            task_rows.append(
                f'<tr><td style="padding:6px;border:1px solid #CBD5E1;font-weight:700">{html.escape(_task_title(task["title"]))}<br><span style="font-size:10px;color:#64748B">{html.escape(task.get("project_title") or task.get("source_type") or "—")}{" · BLL" if task.get("is_bllok") else ""}</span></td>'
                f'<td style="padding:6px;border:1px solid #CBD5E1;background:{_status_color(task)}">{html.escape(str(task.get("status") or "—"))}<br>{html.escape(classification)}</td>'
                f'<td style="padding:6px;border:2px solid {deadline_border}">Plan {html.escape(task.get("original_daily_plan") or "Extra")}<br>Deadline {html.escape(_deadline_display(task))}</td>'
                f'<td style="padding:6px;border:1px solid #CBD5E1">+{html.escape(str(task.get("progress_today") or task.get("completed_delta") or 0))}</td>'
                f'<td style="padding:6px;border:1px solid #CBD5E1;background:{warning}">{html.escape(reason)}</td>'
                f'<td style="padding:6px;border:1px solid #CBD5E1;background:{warning}">{html.escape(comment)}</td>'
                f'<td style="padding:6px;border:1px solid #CBD5E1">1H {html.escape(task.get("one_h_report_slot") or "—")}<br>Approval {html.escape(task.get("adjustment_status") or "—")}<br>Last {html.escape(task.get("last_change") or "—")}<br>{html.escape(", ".join(task.get("issues", [])) or "—")}</td></tr>'
            )
        detail.append(
            f'<h3 style="margin:20px 0 6px">{html.escape(person["employee"])} — {html.escape(person["department"])}</h3>'
            f'<p style="margin:0 0 8px">Plan {m["original_planned_count"]} · Done {m["planned_completed_today_count"]} · In Progress {m["in_progress_count"]} · Postponed {m["postponed_count"]} · No Progress {m["no_progress_count"]} · Extra {m["additional_completed_count"]} · Total Done {m["total_completed_today_count"]} · Plan RLZ {_percent(m["raw_plan_realization"])} · Adjusted {_percent(m["adjusted_plan_realization"])}<br>Deadline Today {m["deadlines_today_count"]} · Completed {m["deadlines_completed_count"]} · Postponed {m["deadlines_postponed_count"]} · Open {m["deadlines_open_count"]} · Overdue {m["overdue_open_count"]} · Critical Open {m["critical_deadlines_open_count"]} · Compliance {_percent(m["deadline_compliance_percentage"])}<br>RLZ {html.escape(person["rlz_close_state"]["status"])} · Manager Approval {html.escape(person["manager_approval"]["status"])} · <b>{html.escape(person["control_state"])}</b></p>'
            '<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font:11px Arial"><tr style="background:#E2E8F0"><th>Task/source</th><th>Status/outcome</th><th>Plan/deadline</th><th>Progress</th><th>Arsyeja</th><th>Komenti</th><th>Control</th></tr>'
            + "".join(task_rows) + '</table>'
        )
    control = summary.get("daily_control_state", "CLEAN_DAY")
    control_bg = "#DCFCE7" if control == "CLEAN_DAY" else "#FEF3C7"
    return '<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:Arial;color:#0F172A"><table width="100%"><tr><td align="center"><table width="1100" style="max-width:100%;background:#FFF;border-collapse:collapse"><tr><td style="padding:18px 20px;background:#2563EB;color:#FFF"><h2 style="margin:0">' + html.escape(subject) + '</h2></td></tr><tr><td style="padding:12px"><table width="100%"><tr>' + cards(kpis) + '</tr></table><h3>Deadline Control</h3><table width="100%"><tr>' + cards(deadline_kpis) + '</tr></table><div style="margin:12px 0;padding:10px;background:' + control_bg + ';font-weight:800;text-align:center">' + html.escape(control) + '</div><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font:10px Arial"><tr style="background:#E2E8F0"><th>Employee</th><th>Department</th><th>Plan</th><th>Done</th><th>Progress</th><th>Postponed</th><th>No Progress</th><th>Extra</th><th>Total</th><th>Plan RLZ</th><th>Deadline</th><th>Open</th><th>Compliance</th><th>RLZ</th><th>Approval</th><th>Control</th></tr>' + overview_rows + '</table>' + ''.join(detail) + '</td></tr></table></td></tr></table></body></html>'


def render_plain(report: dict, report_time: str = REPORT_SLOT) -> str:
    if report.get("variant", "PRECHECK") != "PRECHECK":
        return _manager_plain(report, report_time)
    summary = report["summary"]
    lines = [
        subject_for(date.fromisoformat(report["day"]), report_time, "PRECHECK"), "",
        f"Departments checked: {summary['departments_checked']}",
        f"Employees checked: {summary['employees_checked']}",
        f"Employees not saved: {summary['employees_not_saved']}",
        f"Employees stale: {summary['employees_stale']}",
        f"Manager approval pending: {summary.get('employees_approval_pending', 0)}",
        f"Manager approval stale: {summary.get('employees_approval_stale', 0)}",
        f"Tasks missing reason: {summary['tasks_missing_reason']}",
        f"Tasks missing comment: {summary.get('tasks_missing_comment', 0)}",
        f"Tasks deadline not moved: {summary['tasks_deadline_not_moved']}",
        f"Tasks missing slot: {summary['tasks_missing_slot']}", "",
    ]
    if report["all_good"]:
        return "\n".join(lines + ["Kontrolli ditor RLZ përfundoi pa probleme."])
    for person in report["people"]:
        close_status = person["rlz_close_state"]["status"]
        lines.extend([
            person.get("department", "—"), person["employee"],
            f"RLZ State: {close_status}", f"Arsyeja: {_close_state_reason(close_status)}",
            f"Manager approval: {person.get('manager_approval', {}).get('status', 'PENDING')}",
        ])
        for blocker in person["blockers"]:
            lines.append(f"  {_task_title(blocker['title'])} ({blocker['status']})")
            lines.append(
                f"    Deadline: {blocker.get('due_date') or '—'} | Slot: {blocker.get('one_h_report_slot') or '—'} | "
                f"Arsyeja: {blocker.get('reason_label') or 'Empty'} | Koment: {blocker.get('comment') or '—'}"
            )
            for issue in blocker["issues"]:
                lines.append(f"    - {issue['message']} [{issue['code']}]")
        lines.append("")
    return "\n".join(lines)


def render_html(report: dict, report_time: str = REPORT_SLOT) -> str:
    """Outlook-safe colored RLZ control email, aligned with other PrimeFlow reports."""

    if report.get("variant", "PRECHECK") != "PRECHECK":
        return _manager_html(report, report_time)

    summary = report["summary"]
    metrics = (
        ("Punonjës të kontrolluar", summary["employees_checked"], "#dbeafe", "#1d4ed8"),
        ("Pa ruajtur", summary["employees_not_saved"], "#fee2e2", "#b91c1c"),
        ("Me ndryshime", summary["employees_stale"], "#fef3c7", "#b45309"),
        ("Pa aprovim", summary.get("employees_approval_pending", 0), "#fee2e2", "#b91c1c"),
        ("Aprovim stale", summary.get("employees_approval_stale", 0), "#fef3c7", "#b45309"),
        ("Pa arsye", summary["tasks_missing_reason"], "#fee2e2", "#b91c1c"),
        ("Pa koment", summary.get("tasks_missing_comment", 0), "#ffe4e6", "#be123c"),
        ("Deadline pa shtyrë", summary["tasks_deadline_not_moved"], "#ffedd5", "#c2410c"),
        ("Pa 1H slot", summary["tasks_missing_slot"], "#ede9fe", "#6d28d9"),
        ("Departamente", summary["departments_checked"], "#e2e8f0", "#334155"),
    )
    metric_cells = "".join(
        f'<td bgcolor="{background}" style="background-color:{background};padding:10px;'
        f'border:4px solid #ffffff;font-family:Arial,sans-serif;text-align:center;">'
        f'<div style="font-size:22px;font-weight:800;color:{color};">{value}</div>'
        f'<div style="font-size:11px;line-height:1.25;color:#475569;">{html.escape(label)}</div></td>'
        for label, value, background, color in metrics
    )

    state_colors = {
        "NOT_SAVED": ("#fee2e2", "#dc2626", "Pa ruajtur"),
        "CLOSED_EDIT_WINDOW": ("#fee2e2", "#991b1b", "Pa ruajtur"),
        "STALE": ("#fef3c7", "#d97706", "Duhet ruajtur përsëri"),
        "SAVED": ("#dcfce7", "#16a34a", "Ruajtur"),
    }
    people_html: list[str] = []
    for person in report["people"]:
        close_status = person["rlz_close_state"]["status"]
        background, accent, state_label = state_colors.get(
            close_status, ("#f1f5f9", "#64748b", close_status)
        )
        blocker_rows: list[str] = []
        for blocker in person["blockers"]:
            task_status = blocker.get("status") or "—"
            status_background = {
                "TODO": "#f9a8d4",
                "IN_PROGRESS": "#ffff00",
            }.get(task_status, "#ffffff")
            issue_labels = "".join(
                f'<span style="display:inline-block;margin:2px 4px 2px 0;padding:3px 7px;'
                f'background:#ffffff;border:1px solid {accent};color:{accent};font-size:11px;font-weight:700;">'
                f'{html.escape(issue["message"])}</span>'
                for issue in (blocker.get("issues") or [])
            )
            blocker_rows.append(
                '<tr>'
                f'<td style="padding:9px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;'
                f'font-size:12px;font-weight:700;color:#0f172a;">{html.escape(_task_title(blocker["title"]))}</td>'
                f'<td bgcolor="{status_background}" style="background-color:{status_background};padding:9px;'
                f'border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:12px;">{html.escape(task_status)}</td>'
                f'<td style="padding:9px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:12px;">{html.escape(blocker.get("due_date") or "—")}</td>'
                f'<td style="padding:9px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:12px;">{html.escape(blocker.get("one_h_report_slot") or "—")}</td>'
                f'<td style="padding:9px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:12px;">{html.escape(blocker.get("reason_label") or "Empty")}</td>'
                f'<td style="padding:9px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:12px;">{html.escape(blocker.get("comment") or "—")}</td>'
                f'<td style="padding:7px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;">{issue_labels}</td>'
                '</tr>'
            )
        if not blocker_rows:
            blocker_rows.append(
                '<tr><td colspan="7" style="padding:10px;border:1px solid #cbd5e1;'
                'font-family:Arial,sans-serif;font-size:12px;color:#64748b;">'
                'Nuk ka task të paplotësuar; mungon vetëm ruajtja e gjendjes për RLZ javor.</td></tr>'
            )
        people_html.append(
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
            'style="width:100%;border-collapse:collapse;margin:14px 0 20px;">'
            '<tr>'
            f'<td width="7" bgcolor="{accent}" style="width:7px;background-color:{accent};">&nbsp;</td>'
            f'<td bgcolor="{background}" style="background-color:{background};padding:11px 13px;'
            f'font-family:Arial,sans-serif;border:1px solid {accent};border-left:0;">'
            f'<div style="font-size:15px;font-weight:800;color:#0f172a;">{html.escape(person["employee"])}</div>'
            f'<div style="font-size:12px;color:#475569;margin-top:3px;">{html.escape(person.get("department") or "—")} · '
            f'<strong style="color:{accent};">{html.escape(state_label)}</strong></div>'
            f'<div style="font-size:12px;color:#334155;margin-top:4px;">Aprovimi i menaxherit: '
            f'<strong>{html.escape(person.get("manager_approval", {}).get("status", "PENDING"))}</strong></div>'
            f'<div style="font-size:12px;color:#334155;margin-top:5px;">{html.escape(_close_state_reason(close_status))}</div>'
            '</td></tr>'
            '<tr><td></td><td style="padding-top:8px;">'
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
            'style="width:100%;border-collapse:collapse;">'
            '<tr bgcolor="#e2e8f0">'
            '<th style="padding:7px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:11px;text-align:left;">TASK</th>'
            '<th style="padding:7px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:11px;text-align:left;">STATUS</th>'
            '<th style="padding:7px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:11px;text-align:left;">DEADLINE</th>'
            '<th style="padding:7px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:11px;text-align:left;">1H SLOT</th>'
            '<th style="padding:7px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:11px;text-align:left;">ARSYEJA</th>'
            '<th style="padding:7px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:11px;text-align:left;">KOMENT</th>'
            '<th style="padding:7px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:11px;text-align:left;">ÇFARË KA MBETUR</th>'
            '</tr>' + ''.join(blocker_rows) + '</table></td></tr></table>'
        )

    content = ''.join(people_html)
    if report["all_good"]:
        content = (
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
            'style="width:100%;border-collapse:collapse;margin:16px 0;">'
            '<tr><td bgcolor="#dcfce7" style="background-color:#dcfce7;border:1px solid #16a34a;'
            'padding:16px;font-family:Arial,sans-serif;font-weight:700;color:#166534;">'
            'Kontrolli ditor RLZ përfundoi pa probleme.</td></tr></table>'
        )

    subject = subject_for(date.fromisoformat(report["day"]), report_time, "PRECHECK")
    return f'''<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f8fafc;border-collapse:collapse;">
<tr><td align="center" style="padding:16px 8px;">
<table role="presentation" width="760" cellspacing="0" cellpadding="0" border="0" style="width:760px;max-width:100%;background:#ffffff;border:1px solid #e5e7eb;border-collapse:collapse;">
<tr><td bgcolor="#2563eb" style="background-color:#2563eb;padding:18px 20px;font-family:Arial,sans-serif;">
<div style="font-size:22px;line-height:1.25;font-weight:800;color:#ffffff;">{html.escape(subject)}</div>
<div style="font-size:13px;color:#dbeafe;margin-top:4px;">Raporti automatik tregon kush nuk e ka ruajtur gjendjen dhe çfarë ka mbetur pa plotësuar.</div>
</td></tr>
<tr><td style="padding:14px 16px;background:#ffffff;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;"><tr>{metric_cells}</tr></table>
{content}
</td></tr></table>
</td></tr></table></body></html>'''


async def generate_fresh(day: date, variant: str = "PRECHECK") -> dict:
    async with SessionLocal() as db:
        if variant == "PRECHECK":
            report = await build_daily_rlz_control(db, day=day)
            report["variant"] = "PRECHECK"
            report["content_version"] = 2
            return report
        if variant == "CORRECTION":
            final_snapshot = await _final_snapshot_for_day(db, day)
            if final_snapshot is None:
                raise ValueError("Cannot preview correction without a stored FINAL report")
            current = await build_daily_realization_report(db, day=day, variant="FINAL")
            return report_delta(final_snapshot.normalized_report_json, current)
        report = await build_daily_realization_report(db, day=day, variant=variant)
        return await add_optional_ai_narrative(report)


async def _final_snapshot_for_day(db, day: date) -> PrimeFlowReportSnapshot | None:
    return (await db.execute(
        select(PrimeFlowReportSnapshot)
        .join(PrimeFlowReportDeliveryRun, PrimeFlowReportDeliveryRun.id == PrimeFlowReportSnapshot.delivery_run_id)
        .join(PrimeFlowReportSchedule, PrimeFlowReportSchedule.id == PrimeFlowReportDeliveryRun.schedule_id)
        .where(
            PrimeFlowReportDeliveryRun.report_type == REPORT_TYPE,
            PrimeFlowReportDeliveryRun.report_date == day,
            PrimeFlowReportSchedule.report_variant == "FINAL",
            PrimeFlowReportDeliveryRun.status.in_(["SENT", "ALREADY_SENT"]),
        )
        .order_by(PrimeFlowReportDeliveryRun.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()


async def deliver_daily_rlz_control(
    day: date, *, send: bool = True, scheduled_for: datetime | None = None,
    recipient_map: dict[str, list[str]] | None = None, trigger_type: str = "SCHEDULED",
    triggered_by_user_id=None, manual_reason: str | None = None, schedule_id=None,
    schedule_version: int | None = None, recipient_group: str = "default",
    report_time: str | None = None, variant: str = "PRECHECK",
) -> PrimeFlowReportDeliveryRun:
    variant = variant.upper()
    if trigger_type == "MANUAL" and recipient_group == "default":
        recipient_group = f"manual-{uuid.uuid4().hex}"
    recipients_by_kind = recipient_map or await configured_recipients(SCHEDULE_TYPE)
    if variant == "FINAL" and trigger_type == "SCHEDULED":
        recipients_by_kind = final_recipient_map(recipients_by_kind)
    recipients = sum(recipients_by_kind.values(), [])
    report_time = report_time or (
        scheduled_for.strftime("%H:%M") if scheduled_for else DEFAULT_VARIANT_TIMES.get(variant, REPORT_SLOT)
    )
    subject = subject_for(day, report_time, variant)
    now = tirana_now()
    async with SessionLocal() as db:
        async with db.begin():
            lock_key = f"{REPORT_TYPE}|{day.isoformat()}|{report_time}|{recipient_group}"
            await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": lock_key})
            run = (await db.execute(select(PrimeFlowReportDeliveryRun).where(
                PrimeFlowReportDeliveryRun.report_type == REPORT_TYPE,
                PrimeFlowReportDeliveryRun.report_date == day,
                PrimeFlowReportDeliveryRun.report_slot == report_time,
                PrimeFlowReportDeliveryRun.recipient_group == recipient_group,
            ).with_for_update())).scalar_one_or_none()
            if run is None:
                run = PrimeFlowReportDeliveryRun(
                    report_type=REPORT_TYPE, report_date=day, report_slot=report_time,
                    recipient_group=recipient_group, subject=subject, recipients=json.dumps(recipients),
                    scheduled_for=scheduled_for, scheduled_execution_time=scheduled_for,
                    trigger_type=trigger_type, triggered_by_user_id=triggered_by_user_id,
                    manual_reason=manual_reason, schedule_id=schedule_id, schedule_version=schedule_version,
                )
                db.add(run)
                await db.flush()
            if run.status in TERMINAL:
                return run
            if run.status == "RUNNING" and run.started_at and run.started_at > now - timedelta(minutes=30):
                return run
            run.status, run.started_at, run.attempt_count = "RUNNING", now, run.attempt_count + 1
        try:
            if send and not recipients:
                raise ValueError("RLZ Daily Control has no active database-managed recipients")
            gmail = GmailService() if send else None
            if gmail:
                existing = await gmail.find_exact(subject, recipients)
                if existing:
                    run.status = "ALREADY_SENT"
                    run.gmail_message_id, run.gmail_thread_id = existing.get("id"), existing.get("threadId")
                    run.finished_at = tirana_now()
                    await db.commit()
                    return run
            report = await generate_fresh(day, "FINAL" if variant == "CORRECTION" else variant)
            if variant == "CORRECTION":
                final_snapshot = await _final_snapshot_for_day(db, day)
                if final_snapshot is None:
                    raise ValueError("Cannot create correction without a stored FINAL report")
                report = report_delta(final_snapshot.normalized_report_json, report)
            body, html_body = render_plain(report, report_time), render_html(report, report_time)
            run.body_hash = hashlib.sha256(body.encode()).hexdigest()
            run.data_generated_at = now
            snapshot = (await db.execute(select(PrimeFlowReportSnapshot).where(
                PrimeFlowReportSnapshot.delivery_run_id == run.id
            ))).scalar_one_or_none()
            if snapshot is None:
                db.add(PrimeFlowReportSnapshot(
                    delivery_run_id=run.id, normalized_report_json=report,
                    plain_text_body=body, html_body=html_body, content_version=2,
                ))
            if variant == "CORRECTION" and not report.get("people"):
                run.status = "SKIPPED_NO_CHANGES"
                run.finished_at = tirana_now()
                await db.commit()
                return run
            if send:
                message = await gmail.send_verified(subject, recipients_by_kind, body, html_body)
                run.status = "SENT"
                run.gmail_message_id, run.gmail_thread_id = message.get("id"), message.get("threadId")
            else:
                run.status = "PENDING"
                setattr(run, "dry_run_body", body)
        except Exception as exc:
            run.status, run.error_code, run.error_message = "FAILED_EMAIL", type(exc).__name__, str(exc)[:2000]
        run.finished_at = tirana_now()
        await db.commit()
        return run
