from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from pathlib import Path
from datetime import date, datetime, time, timedelta

from sqlalchemy import select, text
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

from app.db import SessionLocal
from app.models.primeflow_report_delivery_run import PrimeFlowReportDeliveryRun
from app.models.primeflow_report_recipient import PrimeFlowReportRecipient
from app.models.primeflow_report_snapshot import PrimeFlowReportSnapshot
from app.models.question_library import QuestionCategory, QuestionDefinition
from app.models.task_strike_event import TaskStrikeEvent
from app.services.primeflow_report import (
    GmailService, GmailVerificationError, PrimeFlowClient, REMINDER_CATEGORY_NORMALIZED,
    ReportDocument, ReportReminderQuestion, build_report_document,
    predecessor, render_docx, render_html, render_plain_text, render_png, report_subject, report_timezone,
)
from app.services.task_strike_events import render_text_for_interval

logger = logging.getLogger(__name__)
TERMINAL = {"SENT", "ALREADY_SENT"}
STRIKE_INTERVAL_STARTS = {
    "10:00": time(8, 0),
    "11:00": time(9, 0),
    "11:50": time(10, 50),
    "14:20": time(11, 40),
    "16:00": time(14, 10),
}
STRIKE_INTERVAL_ENDS = {
    "10:00": time(9, 0),
    "11:00": time(10, 50),
    "11:50": time(11, 40),
    "14:20": time(14, 10),
    # This report is delivered at 15:50, after its 14:10–15:40 work window.
    "16:00": time(15, 40),
}


def _environment_recipients() -> list[str]:
    raw = os.getenv("PRIMEFLOW_REPORT_RECIPIENTS", "130primex.eu@gmail.com,ga@primexeu.com")
    return [value.strip() for value in raw.split(",") if value.strip()]


def validate_report_config(*, require_gmail: bool = True) -> None:
    required = ["DATABASE_URL", "PRIMEFLOW_API_BASE_URL", "PRIMEFLOW_REPORT_TIMEZONE"]
    if not os.getenv("PRIMEFLOW_ACCESS_TOKEN"):
        required.extend(["PRIMEFLOW_EMAIL", "PRIMEFLOW_PASSWORD"])
    if require_gmail:
        required.extend(["EMAIL_USER", "EMAIL_PASSWORD"])
    missing = sorted({name for name in required if not os.getenv(name)})
    if missing:
        raise RuntimeError("Missing required report configuration: " + ", ".join(missing))
    report_timezone()


async def configured_recipients(report_type: str = "ONE_H") -> dict[str, list[str]]:
    async with SessionLocal() as db:
        rows = (await db.execute(
            select(PrimeFlowReportRecipient)
            .where(PrimeFlowReportRecipient.is_active.is_(True))
            .where(PrimeFlowReportRecipient.report_type == report_type)
            .order_by(PrimeFlowReportRecipient.sort_order, PrimeFlowReportRecipient.email)
        )).scalars().all()
    if not rows and report_type == "ONE_H":
        return {"to": _environment_recipients(), "cc": [], "bcc": []}
    if not rows:
        return {"to": [], "cc": [], "bcc": []}
    result = {"to": [], "cc": [], "bcc": []}
    for row in rows:
        result[row.recipient_type.lower()].append(row.email)
    return result


async def load_1h_reminder_questions() -> list[ReportReminderQuestion]:
    async with SessionLocal() as db:
        category = await db.scalar(
            select(QuestionCategory).where(
                QuestionCategory.normalized_name == REMINDER_CATEGORY_NORMALIZED
            )
        )
        if category is None:
            return []
        rows = (
            await db.execute(
                select(QuestionDefinition)
                .where(QuestionDefinition.category_id == category.id)
                .order_by(QuestionDefinition.sort_order, QuestionDefinition.created_at)
            )
        ).scalars().all()
    return [
        ReportReminderQuestion(text=row.text.strip(), guidance=(row.guidance or "").strip())
        for row in rows
        if row.text and row.text.strip()
    ]


def _report_task_text(data: dict) -> tuple[dict[uuid.UUID, str], dict[uuid.UUID, str | None]]:
    """Read task titles and descriptions that can be shown in the report."""

    titles: dict[uuid.UUID, str] = {}
    descriptions: dict[uuid.UUID, str | None] = {}
    for bucket in (data.get("items") or {}).values():
        if not isinstance(bucket, list):
            continue
        for task in bucket:
            if not isinstance(task, dict) or (task.get("task_id") is None and task.get("id") is None):
                continue
            try:
                # Common View uses a date-specific display id (`task:<id>:<day>`)
                # but strike history belongs to the underlying task UUID.
                task_id = uuid.UUID(str(task.get("task_id") or task["id"]))
            except (TypeError, ValueError):
                continue
            title = task.get("title") or task.get("task_title") or task.get("task")
            if title is not None:
                titles[task_id] = str(title)
            if "description" in task:
                descriptions[task_id] = task.get("description")
    return titles, descriptions


def strike_interval_start(day: date, slot: str) -> datetime:
    """Fixed reporting windows agreed for the five weekday 1H emails."""
    try:
        start = STRIKE_INTERVAL_STARTS[slot]
    except KeyError as exc:
        raise ValueError(f"Unsupported 1H report slot: {slot}") from exc
    return datetime.combine(day, start, tzinfo=report_timezone())


def strike_interval_end(day: date, slot: str) -> datetime:
    try:
        end = STRIKE_INTERVAL_ENDS[slot]
    except KeyError as exc:
        raise ValueError(f"Unsupported 1H report slot: {slot}") from exc
    return datetime.combine(day, end, tzinfo=report_timezone())


async def _text_overrides_for_1h_interval(
    data: dict,
    day: date,
    slot: str,
    *,
    interval_end: datetime,
) -> tuple[dict[str, tuple[str, str]], dict[str, tuple[str, str]]]:
    titles, descriptions = _report_task_text(data)
    task_ids = set(titles) | set(descriptions)
    if not task_ids:
        return {}, {}
    async with SessionLocal() as db:
        interval_start = strike_interval_start(day, slot)
        events = (await db.execute(
            select(TaskStrikeEvent)
            .where(TaskStrikeEvent.task_id.in_(task_ids))
            .where(TaskStrikeEvent.occurred_at <= interval_end)
            .order_by(TaskStrikeEvent.occurred_at, TaskStrikeEvent.id)
        )).scalars().all()

    by_task: dict[uuid.UUID, list[TaskStrikeEvent]] = {}
    for event in events:
        by_task.setdefault(event.task_id, []).append(event)
    title_overrides = {
        str(task_id): render_text_for_interval(
            title,
            by_task.get(task_id, []),
            interval_start=interval_start,
            interval_end=interval_end,
            field_name="TITLE",
        )
        for task_id, title in titles.items()
    }
    description_overrides = {
        str(task_id): render_text_for_interval(
            description,
            by_task.get(task_id, []),
            interval_start=interval_start,
            interval_end=interval_end,
            field_name="DESCRIPTION",
        )
        for task_id, description in descriptions.items()
    }
    return title_overrides, description_overrides


async def generate_fresh(day: date, slot: str, recipients: dict[str, list[str]] | None = None) -> ReportDocument:
    client = PrimeFlowClient(
        os.environ["PRIMEFLOW_API_BASE_URL"].rstrip("/"),
        os.getenv("PRIMEFLOW_EMAIL"), os.getenv("PRIMEFLOW_PASSWORD"), os.getenv("PRIMEFLOW_ACCESS_TOKEN"),
    )
    data = await client.common_view(day)
    reminders = await load_1h_reminder_questions()
    title_overrides, description_overrides = await _text_overrides_for_1h_interval(
        data, day, slot, interval_end=strike_interval_end(day, slot),
    )
    return build_report_document(
        data,
        day,
        slot,
        recipients or await configured_recipients(),
        reminders=reminders,
        title_overrides=title_overrides,
        description_overrides=description_overrides,
    )


async def deliver_report(
    day: date, slot: str, *, send: bool = True, scheduled_for: datetime | None = None,
    recipient_map: dict[str, list[str]] | None = None, trigger_type: str = "SCHEDULED",
    triggered_by_user_id=None, manual_reason: str | None = None, schedule_id=None,
    schedule_version: int | None = None, recipient_group: str = "default",
) -> PrimeFlowReportDeliveryRun:
    if trigger_type == "MANUAL" and recipient_group == "default":
        recipient_group = f"manual-{uuid.uuid4().hex}"
    recipient_map = recipient_map or await configured_recipients()
    recipients = sum(recipient_map.values(), [])
    subject = report_subject(day, slot)
    now = datetime.now(report_timezone())
    async with SessionLocal() as db:
        async with db.begin():
            # Serialize even the first insert; the unique constraint remains the
            # final guard if another application bypasses this service.
            lock_key = f"primeflow_1h|{day.isoformat()}|{slot}|{recipient_group}"
            await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": lock_key})
            run = (await db.execute(
                select(PrimeFlowReportDeliveryRun)
                .where(
                    PrimeFlowReportDeliveryRun.report_type == "primeflow_1h",
                    PrimeFlowReportDeliveryRun.report_date == day,
                    PrimeFlowReportDeliveryRun.report_slot == slot,
                    PrimeFlowReportDeliveryRun.recipient_group == recipient_group,
                ).with_for_update()
            )).scalar_one_or_none()
            if run is None:
                run = PrimeFlowReportDeliveryRun(
                    report_date=day, report_slot=slot, recipient_group=recipient_group,
                    subject=subject, recipients=json.dumps(recipients), status="PENDING",
                    scheduled_for=scheduled_for, trigger_type=trigger_type,
                    triggered_by_user_id=triggered_by_user_id, manual_reason=manual_reason,
                    schedule_id=schedule_id, schedule_version=schedule_version,
                    scheduled_execution_time=scheduled_for,
                )
                db.add(run)
                await db.flush()
            if run.status in TERMINAL:
                return run
            if run.status == "RUNNING" and run.started_at and run.started_at > now - timedelta(minutes=30):
                return run
            run.status, run.started_at, run.attempt_count = "RUNNING", now, run.attempt_count + 1

        gmail = GmailService() if send else None
        try:
            if gmail:
                existing = await gmail.find_exact(subject, recipients)
                if existing:
                    run.status = "ALREADY_SENT"
                    run.gmail_message_id, run.gmail_thread_id = existing.get("id"), existing.get("threadId")
                    run.finished_at = datetime.now(report_timezone())
                    await db.commit()
                    return run
            document = await generate_fresh(day, slot, recipient_map)
            body = render_plain_text(document)
            html_body = render_html(document)
            run.body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
            run.data_generated_at = document.source_generated_at
            snapshot = (await db.execute(
                select(PrimeFlowReportSnapshot).where(PrimeFlowReportSnapshot.delivery_run_id == run.id)
            )).scalar_one_or_none()
            if snapshot is None:
                snapshot = PrimeFlowReportSnapshot(
                    delivery_run_id=run.id,
                    normalized_report_json=document.model_dump(mode="json"),
                    plain_text_body=body,
                    html_body=html_body,
                    content_version=1,
                )
                db.add(snapshot)
            if not send:
                run.status, run.finished_at = "PENDING", datetime.now(report_timezone())
                await db.commit()
                setattr(run, "dry_run_body", body)
                return run
            filename_stem = f"PrimeFlow-1H-{day:%Y-%m-%d}-{slot.replace(':', '')}"
            attachments = [
                (
                    f"{filename_stem}.docx",
                    render_docx(document),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ),
                (f"{filename_stem}.png", render_png(document), "image/png"),
            ]
            message = await gmail.send_verified(
                subject, recipient_map, body, html_body, attachments=attachments,
            )
            run.status = "SENT"
            run.gmail_message_id, run.gmail_thread_id = message.get("id"), message.get("threadId")
        except ValueError as exc:
            run.status, run.error_code, run.error_message = "FAILED_DATA", type(exc).__name__, str(exc)[:2000]
        except GmailVerificationError as exc:
            run.status, run.error_code, run.error_message = "FAILED_VERIFICATION", type(exc).__name__, str(exc)[:2000]
            run.gmail_message_id = exc.response.get("id")
            run.gmail_thread_id = exc.response.get("threadId")
        except Exception as exc:
            run.status, run.error_code, run.error_message = "FAILED_EMAIL", type(exc).__name__, str(exc)[:2000]
        run.finished_at = datetime.now(report_timezone())
        await db.commit()
        logger.info("primeflow_report_run run_id=%s report_date=%s report_slot=%s final_status=%s", run.id, day, slot, run.status)
        return run


async def execute_chain(
    day: date, slot: str, *, schedule_id=None, schedule_version: int | None = None,
    scheduled_for: datetime | None = None,
) -> list[PrimeFlowReportDeliveryRun]:
    if day.weekday() >= 5:
        return []
    preceding_day, preceding_slot = predecessor(day, slot)
    first = await deliver_report(preceding_day, preceding_slot, trigger_type="BACKFILL")
    second = await deliver_report(
        day, slot, schedule_id=schedule_id, schedule_version=schedule_version,
        scheduled_for=scheduled_for, trigger_type="SCHEDULED",
    )
    return [first, second]
