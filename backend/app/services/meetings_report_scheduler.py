from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.db import SessionLocal
from app.models.meetings_report_draft import MeetingsReportDraft
from app.models.meetings_report_settings import MeetingsReportSettings
from app.services.meetings_report import build_meetings_report_sections, render_html, render_plain_text, send_meetings_report, subject_for

logger = logging.getLogger(__name__)


DEFAULT_RECIPIENTS = {"to": ["130primex.eu@gmail.com"], "cc": [], "bcc": []}


def normalize_recipients(value: dict | None) -> dict[str, list[str]]:
    raw = value or {}
    result = {"to": [], "cc": [], "bcc": []}
    for kind in result:
        rows = raw.get(kind) if isinstance(raw, dict) else []
        if not isinstance(rows, list):
            continue
        seen: set[str] = set()
        for email in rows:
            cleaned = str(email).strip()
            normalized = cleaned.lower()
            if not cleaned or normalized in seen:
                continue
            seen.add(normalized)
            result[kind].append(cleaned)
    return result


async def get_or_create_meetings_report_settings() -> MeetingsReportSettings:
    async with SessionLocal() as db:
        row = (
            await db.execute(select(MeetingsReportSettings).order_by(MeetingsReportSettings.created_at.asc()))
        ).scalars().first()
        if row is None:
            row = MeetingsReportSettings(recipients=DEFAULT_RECIPIENTS)
            db.add(row)
            await db.commit()
            await db.refresh(row)
        return row


async def run_meetings_report_scheduler_once(now: datetime | None = None) -> bool:
    async with SessionLocal() as db:
        settings = (
            await db.execute(select(MeetingsReportSettings).order_by(MeetingsReportSettings.created_at.asc()))
        ).scalars().first()
        if settings is None or not settings.is_active:
            return False

        timezone = ZoneInfo(settings.timezone or "Europe/Tirane")
        local_now = (now or datetime.now(timezone)).astimezone(timezone) if (now and now.tzinfo) else (now or datetime.now(timezone))
        report_day = local_now.date()
        if local_now.weekday() not in (settings.weekdays or []):
            return False
        if local_now.time().replace(second=0, microsecond=0) < settings.send_time:
            return False

        row = (
            await db.execute(select(MeetingsReportDraft).where(MeetingsReportDraft.report_date == report_day))
        ).scalar_one_or_none()
        if row and row.status == "SENT":
            sent_at = row.sent_at
            settings_updated_at = settings.updated_at
            if sent_at and settings_updated_at and settings_updated_at > sent_at:
                logger.info(
                    "meetings_report_scheduler_resend_allowed reason=settings_changed report_date=%s",
                    report_day,
                )
            else:
                return False

        recipients = normalize_recipients(settings.recipients)
        if not recipients["to"]:
            logger.warning("meetings_report_scheduler_skipped reason=no_to_recipients")
            return False

        tomorrow, sections, snapshot = await build_meetings_report_sections(db, report_day)
        if row is None:
            row = MeetingsReportDraft(
                report_date=report_day,
                tomorrow_date=tomorrow,
                subject=subject_for(report_day),
                recipients=recipients,
                sections=sections,
                generated_snapshot=snapshot,
            )
            db.add(row)
            await db.flush()
        else:
            row.tomorrow_date = tomorrow
            row.subject = row.subject or subject_for(report_day)
            row.recipients = recipients
            row.sections = sections
            row.generated_snapshot = snapshot

        plain_text = render_plain_text(row.subject, row.report_date, row.tomorrow_date, row.sections)
        html_body = render_html(row.subject, row.report_date, row.tomorrow_date, row.sections)
        try:
            message = await send_meetings_report(row.subject, recipients, plain_text, html_body)
        except Exception as exc:
            row.status = "DRAFT"
            row.last_error = str(exc)[:2000]
            await db.commit()
            logger.exception("meetings_report_scheduler_send_failed")
            return False

        row.status = "SENT"
        row.sent_at = datetime.now(timezone)
        row.gmail_message_id = message.get("id")
        row.gmail_thread_id = message.get("threadId")
        row.last_error = None
        settings.last_run_date = datetime.now(timezone)
        await db.commit()
        logger.info("meetings_report_scheduler_sent report_date=%s", report_day)
        return True


async def run_meetings_report_scheduler_forever() -> None:
    while True:
        try:
            await run_meetings_report_scheduler_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("meetings_report_scheduler_failed")
        await asyncio.sleep(30)
