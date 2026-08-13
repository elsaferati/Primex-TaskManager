from __future__ import annotations

import hashlib
import html
import json
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select, text

from app.db import SessionLocal
from app.models.primeflow_report_delivery_run import PrimeFlowReportDeliveryRun
from app.models.primeflow_report_snapshot import PrimeFlowReportSnapshot
from app.services.daily_rlz_compliance import build_daily_rlz_control, tirana_now
from app.services.primeflow_report import GmailService
from app.services.primeflow_report_delivery import configured_recipients

REPORT_TYPE = "rlz_daily_control"
SCHEDULE_TYPE = "RLZ_DAILY_CONTROL"
REPORT_SLOT = "16:00"
TERMINAL = {"SENT", "ALREADY_SENT"}


def subject_for(day: date, report_time: str = REPORT_SLOT) -> str:
    return f"[PrimeFlow] Kontrolli ditor RLZ - {day:%d/%m/%Y} - {report_time}"


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
    summary = report["summary"]
    lines = [
        subject_for(date.fromisoformat(report["day"]), report_time), "",
        f"Departments checked: {summary['departments_checked']}",
        f"Employees checked: {summary['employees_checked']}",
        f"Employees not saved: {summary['employees_not_saved']}",
        f"Employees stale: {summary['employees_stale']}",
        f"Tasks missing reason: {summary['tasks_missing_reason']}",
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

    summary = report["summary"]
    metrics = (
        ("Punonjës të kontrolluar", summary["employees_checked"], "#dbeafe", "#1d4ed8"),
        ("Pa ruajtur", summary["employees_not_saved"], "#fee2e2", "#b91c1c"),
        ("Me ndryshime", summary["employees_stale"], "#fef3c7", "#b45309"),
        ("Pa arsye", summary["tasks_missing_reason"], "#fee2e2", "#b91c1c"),
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
                f'<td style="padding:9px;border:1px solid #cbd5e1;font-family:Arial,sans-serif;font-size:12px;">{html.escape(blocker.get("status") or "—")}</td>'
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

    subject = subject_for(date.fromisoformat(report["day"]), report_time)
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


async def generate_fresh(day: date) -> dict:
    async with SessionLocal() as db:
        return await build_daily_rlz_control(db, day=day)


async def deliver_daily_rlz_control(
    day: date, *, send: bool = True, scheduled_for: datetime | None = None,
    recipient_map: dict[str, list[str]] | None = None, trigger_type: str = "SCHEDULED",
    triggered_by_user_id=None, manual_reason: str | None = None, schedule_id=None,
    schedule_version: int | None = None, recipient_group: str = "default",
    report_time: str | None = None,
) -> PrimeFlowReportDeliveryRun:
    if trigger_type == "MANUAL" and recipient_group == "default":
        recipient_group = f"manual-{uuid.uuid4().hex}"
    recipients_by_kind = recipient_map or await configured_recipients(SCHEDULE_TYPE)
    recipients = sum(recipients_by_kind.values(), [])
    report_time = report_time or (scheduled_for.strftime("%H:%M") if scheduled_for else REPORT_SLOT)
    subject = subject_for(day, report_time)
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
            report = await generate_fresh(day)
            body, html_body = render_plain(report, report_time), render_html(report, report_time)
            run.body_hash = hashlib.sha256(body.encode()).hexdigest()
            run.data_generated_at = now
            snapshot = (await db.execute(select(PrimeFlowReportSnapshot).where(
                PrimeFlowReportSnapshot.delivery_run_id == run.id
            ))).scalar_one_or_none()
            if snapshot is None:
                db.add(PrimeFlowReportSnapshot(
                    delivery_run_id=run.id, normalized_report_json=report,
                    plain_text_body=body, html_body=html_body, content_version=1,
                ))
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
