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
    result = {key: list(recipients.get(key, [])) for key in ("to", "cc", "bcc")}
    seen = {str(email).casefold() for values in result.values() for email in values}
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


def _full_plain(report: dict, report_time: str) -> str:
    summary = report["summary"]
    lines = [
        subject_for(date.fromisoformat(report["day"]), report_time, report["variant"]),
        report.get("narrative") or "Krahasimi i planit javor me realizimin faktik të ditës.",
        "",
        f"Plan sot: {summary.get('planned_today', 0)} | Kryer sot: {summary.get('completed_today', 0)} | ",
        f"Pa kryer: {summary.get('unfinished', 0)} | Ekstra: {summary.get('extras', 0)} | ",
        f"Për nesër: {summary.get('carryover_next_day', 0)} | Shtyrë: {summary.get('postponed', 0)}",
        "",
    ]
    for person in report.get("people") or []:
        lines.append(f"{person['department']} — {person['employee']}")
        lines.append(
            person.get("narrative")
            or f"Ditor {person.get('daily_progress_percent', 0)}% | Javor {person.get('weekly_progress_percent', 0)}% | RLZ {person['rlz_close_state']['status']} | Aprovimi {person['manager_approval']['status']}"
        )
        for task in person.get("tasks") or []:
            flags = ", ".join(task.get("flags") or []) or "pa ndryshim"
            lines.append(f"  - [{task['status']}] {_task_title(task['title'])} ({flags})")
            lines.append(
                f"    Afati: {task.get('planned_due_date') or '—'} → {task.get('due_date') or '—'} | "
                f"Arsyeja: {task.get('reason_label') or '—'} | Koment: {task.get('comment') or '—'}"
            )
        lines.append("")
    return "\n".join(lines)


def _full_html(report: dict, report_time: str) -> str:
    summary = report["summary"]
    cards = "".join(
        f'<td style="padding:9px;border:4px solid #fff;background:{bg};text-align:center;font-family:Arial">'
        f'<b style="font-size:21px;color:{fg}">{value}</b><br><span style="font-size:11px;color:#475569">{html.escape(label)}</span></td>'
        for label, value, bg, fg in (
            ("Plan sot", summary.get("planned_today", 0), "#dbeafe", "#1d4ed8"),
            ("Kryer sot", summary.get("completed_today", 0), "#dcfce7", "#15803d"),
            ("Pa kryer", summary.get("unfinished", 0), "#fee2e2", "#b91c1c"),
            ("Ekstra", summary.get("extras", 0), "#e0e7ff", "#4338ca"),
            ("Për nesër", summary.get("carryover_next_day", 0), "#fef3c7", "#b45309"),
            ("Shtyrë", summary.get("postponed", 0), "#ffedd5", "#c2410c"),
        )
    )
    people = []
    for person in report.get("people") or []:
        rows = []
        for task in person.get("tasks") or []:
            color = "#dcfce7" if task["status"] == "DONE" else "#ffffcc" if task["status"] == "IN_PROGRESS" else "#fce7f3"
            rows.append(
                f'<tr><td style="border:1px solid #cbd5e1;padding:7px;font-weight:700">{html.escape(_task_title(task["title"]))}</td>'
                f'<td style="border:1px solid #cbd5e1;padding:7px;background:{color}">{html.escape(task["status"])}</td>'
                f'<td style="border:1px solid #cbd5e1;padding:7px">{html.escape(", ".join(task.get("flags") or []) or "—")}</td>'
                f'<td style="border:1px solid #cbd5e1;padding:7px">{html.escape(task.get("planned_due_date") or "—")} → {html.escape(task.get("due_date") or "—")}</td>'
                f'<td style="border:1px solid #cbd5e1;padding:7px">{html.escape(task.get("reason_label") or "—")}</td>'
                f'<td style="border:1px solid #cbd5e1;padding:7px">{html.escape(task.get("comment") or "—")}</td></tr>'
            )
        people.append(
            f'<h3 style="margin:18px 0 4px">{html.escape(person["employee"])} <span style="font-size:12px;color:#64748b">— {html.escape(person["department"])}</span></h3>'
            f'<p style="margin:3px 0 8px;color:#475569">{html.escape(person.get("narrative") or "")} Ditor {person.get("daily_progress_percent", 0)}% · Javor {person.get("weekly_progress_percent", 0)}% · RLZ {html.escape(person["rlz_close_state"]["status"])} · Aprovimi {html.escape(person["manager_approval"]["status"])}</p>'
            '<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font:12px Arial">'
            '<tr style="background:#e2e8f0"><th>Task</th><th>Status</th><th>Ndryshimi</th><th>Afati</th><th>Arsyeja</th><th>Komenti</th></tr>'
            + "".join(rows)
            + '</table>'
        )
    subject = subject_for(date.fromisoformat(report["day"]), report_time, report["variant"])
    return (
        '<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial;color:#0f172a">'
        '<table width="100%"><tr><td align="center"><table width="900" style="max-width:100%;background:#fff;border-collapse:collapse">'
        f'<tr><td style="padding:18px 20px;background:#2563eb;color:#fff"><h2 style="margin:0">{html.escape(subject)}</h2>'
        f'<p style="margin:5px 0 0">{html.escape(report.get("narrative") or "Krahasimi i planit javor me realizimin faktik të ditës.")}</p></td></tr>'
        f'<tr><td style="padding:12px"><table width="100%"><tr>{cards}</tr></table>{"".join(people)}</td></tr>'
        '</table></td></tr></table></body></html>'
    )


def _close_state_reason(status: str) -> str:
    return {
        "NOT_SAVED": "Gjendja për RLZ javor nuk është ruajtur.",
        "CLOSED_EDIT_WINDOW": "Gjendja nuk u ruajt para mbylljes së afatit.",
        "STALE": "Ka ndryshime pas ruajtjes; gjendja duhet ruajtur përsëri për RLZ javor.",
        "SAVED": "Gjendja është ruajtur, por kanë mbetur pika të paplotësuara.",
    }.get(status, "Gjendja për RLZ javor kërkon kontroll.")


def _task_title(title: str) -> str:
    return next((line.strip() for line in title.splitlines() if line.strip()), title)


def render_plain(report: dict, report_time: str = REPORT_SLOT) -> str:
    if report.get("variant", "PRECHECK") != "PRECHECK":
        return _full_plain(report, report_time)
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
        return _full_html(report, report_time)

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
    report_time = report_time or (scheduled_for.strftime("%H:%M") if scheduled_for else REPORT_SLOT)
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
