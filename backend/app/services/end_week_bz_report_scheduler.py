from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models.end_week_bz_report_draft import EndWeekBzReportDraft
from app.models.end_week_bz_report_settings import EndWeekBzReportSettings
from app.services.end_week_bz_report import (
    build_end_week_bz_report_sections, normalize_sections, render_html, render_plain_text,
    send_end_week_bz_report, subject_for,
)
from app.services.meetings_report_scheduler import normalize_recipients

logger = logging.getLogger(__name__)


async def run_end_week_bz_report_scheduler_once(now: datetime | None = None) -> bool:
    async with SessionLocal() as db:
        settings = (await db.execute(select(EndWeekBzReportSettings).order_by(EndWeekBzReportSettings.created_at))).scalars().first()
        if settings is None or not settings.is_active:
            return False
        timezone = ZoneInfo(settings.timezone or "Europe/Tirane")
        local_now = now.astimezone(timezone) if now and now.tzinfo else (now or datetime.now(timezone))
        if local_now.weekday() not in (settings.weekdays or []):
            return False
        if local_now.time().replace(second=0, microsecond=0) != settings.send_time.replace(second=0, microsecond=0):
            return False
        report_day = local_now.date()
        locked = (await db.execute(select(func.pg_try_advisory_xact_lock(func.hashtext(f"end_week_bz_report|{report_day}"))))).scalar_one()
        if not locked:
            return False
        row = (await db.execute(select(EndWeekBzReportDraft).where(EndWeekBzReportDraft.report_date == report_day))).scalar_one_or_none()
        if row and row.status == "SENT":
            return False
        recipients = normalize_recipients(settings.recipients)
        if not recipients["to"]:
            logger.warning("end_week_bz_report_scheduler_skipped reason=no_to_recipients")
            return False
        sections, snapshot = await build_end_week_bz_report_sections(db, report_day)
        if row is None:
            row = EndWeekBzReportDraft(report_date=report_day, subject=subject_for(report_day), recipients=recipients, sections=sections, generated_snapshot=snapshot)
            db.add(row); await db.flush()
        else:
            row.subject, row.recipients, row.sections, row.generated_snapshot = subject_for(report_day), recipients, sections, snapshot
        sections = normalize_sections(row.sections)
        try:
            message = await send_end_week_bz_report(row.subject, recipients, render_plain_text(row.subject, report_day, sections), render_html(row.subject, report_day, sections), report_day=report_day, sections=sections)
        except Exception as exc:
            row.status, row.last_error = "DRAFT", str(exc)[:2000]
            await db.commit(); logger.exception("end_week_bz_report_scheduler_send_failed")
            return False
        row.status, row.sent_at, row.gmail_message_id, row.gmail_thread_id, row.last_error = "SENT", datetime.now(timezone), message.get("id"), message.get("threadId"), None
        settings.last_run_date = datetime.now(timezone)
        await db.commit()
        return True


async def run_end_week_bz_report_scheduler_forever() -> None:
    while True:
        try:
            await run_end_week_bz_report_scheduler_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("end_week_bz_report_scheduler_failed")
        await asyncio.sleep(30)
