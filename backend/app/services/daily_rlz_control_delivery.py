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


def subject_for(day: date) -> str:
    return f"[PrimeFlow] Kontrolli ditor RLZ - {day:%d/%m/%Y} - 16:00"


def render_plain(report: dict) -> str:
    summary = report["summary"]
    lines = [subject_for(date.fromisoformat(report["day"])), "",
             f"Departments checked: {summary['departments_checked']}",
             f"Employees checked: {summary['employees_checked']}",
             f"Employees not saved: {summary['employees_not_saved']}",
             f"Employees stale: {summary['employees_stale']}",
             f"Tasks missing reason: {summary['tasks_missing_reason']}",
             f"Tasks deadline not moved: {summary['tasks_deadline_not_moved']}",
             f"Tasks missing slot: {summary['tasks_missing_slot']}", ""]
    if report["all_good"]:
        return "\n".join(lines + ["Kontrolli ditor RLZ përfundoi pa probleme."])
    for person in report["people"]:
        lines.extend([person.get("department", "—"), person["employee"], f"RLZ State: {person['rlz_close_state']['status']}"])
        for blocker in person["blockers"]:
            lines.append(f"  {blocker['title']} ({blocker['status']})")
            lines.append(
                f"    Deadline: {blocker.get('due_date') or '—'} | Slot: {blocker.get('one_h_report_slot') or '—'} | "
                f"Arsyeja: {blocker.get('reason_label') or '—'} | Koment: {blocker.get('comment') or '—'}"
            )
            for issue in blocker["issues"]:
                lines.append(f"    - {issue['message']} [{issue['code']}]")
        lines.append("")
    return "\n".join(lines)


def render_html(report: dict) -> str:
    plain = render_plain(report)
    return "<html><body><pre style='font-family:Arial,sans-serif;white-space:pre-wrap'>" + html.escape(plain) + "</pre></body></html>"


async def generate_fresh(day: date) -> dict:
    async with SessionLocal() as db:
        return await build_daily_rlz_control(db, day=day)


async def deliver_daily_rlz_control(
    day: date, *, send: bool = True, scheduled_for: datetime | None = None,
    recipient_map: dict[str, list[str]] | None = None, trigger_type: str = "SCHEDULED",
    triggered_by_user_id=None, manual_reason: str | None = None, schedule_id=None,
    schedule_version: int | None = None, recipient_group: str = "default",
) -> PrimeFlowReportDeliveryRun:
    if trigger_type == "MANUAL" and recipient_group == "default":
        recipient_group = f"manual-{uuid.uuid4().hex}"
    recipients_by_kind = recipient_map or await configured_recipients(SCHEDULE_TYPE)
    recipients = sum(recipients_by_kind.values(), [])
    subject = subject_for(day)
    now = tirana_now()
    async with SessionLocal() as db:
        async with db.begin():
            lock_key = f"{REPORT_TYPE}|{day.isoformat()}|{REPORT_SLOT}|{recipient_group}"
            await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": lock_key})
            run = (await db.execute(select(PrimeFlowReportDeliveryRun).where(
                PrimeFlowReportDeliveryRun.report_type == REPORT_TYPE,
                PrimeFlowReportDeliveryRun.report_date == day,
                PrimeFlowReportDeliveryRun.report_slot == REPORT_SLOT,
                PrimeFlowReportDeliveryRun.recipient_group == recipient_group,
            ).with_for_update())).scalar_one_or_none()
            if run is None:
                run = PrimeFlowReportDeliveryRun(
                    report_type=REPORT_TYPE, report_date=day, report_slot=REPORT_SLOT,
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
            body, html_body = render_plain(report), render_html(report)
            run.body_hash = hashlib.sha256(body.encode()).hexdigest()
            run.data_generated_at = now
            snapshot = (await db.execute(select(PrimeFlowReportSnapshot).where(
                PrimeFlowReportSnapshot.delivery_run_id == run.id
            ))).scalar_one_or_none()
            if snapshot is None:
                db.add(PrimeFlowReportSnapshot(delivery_run_id=run.id, normalized_report_json=report,
                    plain_text_body=body, html_body=html_body, content_version=1))
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
