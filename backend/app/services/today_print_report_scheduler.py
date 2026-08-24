from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.db import SessionLocal
from app.models.today_print_report_delivery import TodayPrintReportDelivery
from app.models.today_print_report_settings import TodayPrintReportSettings
from app.services.meetings_report_scheduler import normalize_recipients
from app.services.tomorrow_print_report import build_today_print_report, send_tomorrow_print_report

logger = logging.getLogger(__name__)


async def run_today_print_report_scheduler_once(now: datetime | None = None) -> bool:
    async with SessionLocal() as db:
        settings = (
            await db.execute(select(TodayPrintReportSettings).order_by(TodayPrintReportSettings.created_at.asc()))
        ).scalars().first()
        if settings is None or not settings.is_active:
            return False

        timezone = ZoneInfo(settings.timezone or "Europe/Tirane")
        local_now = (now or datetime.now(timezone)).astimezone(timezone) if now and now.tzinfo else (now or datetime.now(timezone))
        delivery_date = local_now.date()
        if local_now.weekday() not in (settings.weekdays or []):
            return False
        if local_now.time().replace(second=0, microsecond=0) < settings.send_time:
            return False

        row = (
            await db.execute(
                select(TodayPrintReportDelivery).where(TodayPrintReportDelivery.delivery_date == delivery_date)
            )
        ).scalar_one_or_none()
        if row is not None and row.status == "SENT":
            return False

        recipients = normalize_recipients(settings.recipients)
        if not recipients["to"]:
            logger.warning("today_print_report_scheduler_skipped reason=no_to_recipients")
            return False
        try:
            report = await build_today_print_report(delivery_date, include_attachment=True)
            if row is None:
                row = TodayPrintReportDelivery(
                    delivery_date=delivery_date,
                    target_date=delivery_date,
                    subject=report["subject"],
                    recipients=recipients,
                    status="PENDING",
                )
                db.add(row)
                await db.flush()
            else:
                row.subject = report["subject"]
                row.recipients = recipients
            message = await send_tomorrow_print_report(report, recipients)
        except Exception as exc:
            if row is not None:
                row.status = "FAILED"
                row.last_error = str(exc)[:2000]
                await db.commit()
            logger.exception("today_print_report_scheduler_send_failed")
            return False

        row.status = "SENT"
        row.sent_at = datetime.now(timezone)
        row.gmail_message_id = message.get("id")
        row.gmail_thread_id = message.get("threadId")
        row.last_error = None
        settings.last_run_date = row.sent_at
        await db.commit()
        logger.info("today_print_report_scheduler_sent delivery_date=%s", delivery_date)
        return True


async def run_today_print_report_scheduler_forever() -> None:
    while True:
        try:
            await run_today_print_report_scheduler_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("today_print_report_scheduler_failed")
        await asyncio.sleep(30)
