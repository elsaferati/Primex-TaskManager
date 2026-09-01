from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.db import SessionLocal
from app.models.tomorrow_print_report_delivery import TomorrowPrintReportDelivery
from app.models.tomorrow_print_report_settings import TomorrowPrintReportSettings
from app.services.meetings_report_scheduler import normalize_recipients
from app.services.tomorrow_print_report import (
    build_tomorrow_print_report,
    ensure_required_shtypi_recipient,
    send_tomorrow_print_report,
)

logger = logging.getLogger(__name__)
SECOND_SEND_OFFSET = timedelta(minutes=20)


async def run_tomorrow_print_report_scheduler_once(now: datetime | None = None) -> bool:
    async with SessionLocal() as db:
        settings = (
            await db.execute(select(TomorrowPrintReportSettings).order_by(TomorrowPrintReportSettings.created_at.asc()))
        ).scalars().first()
        if settings is None or not settings.is_active:
            return False

        timezone = ZoneInfo(settings.timezone or "Europe/Tirane")
        local_now = (now or datetime.now(timezone)).astimezone(timezone) if now and now.tzinfo else (now or datetime.now(timezone))
        delivery_date = local_now.date()
        if local_now.weekday() not in (settings.weekdays or []):
            return False
        first_send_time = settings.send_time
        second_send_time = (
            datetime.combine(delivery_date, first_send_time) + SECOND_SEND_OFFSET
        ).time()
        current_time = local_now.time().replace(second=0, microsecond=0)
        if current_time < first_send_time:
            return False

        # Tomorrow 1H SHTYPI is delivered twice: at the configured time and
        # again 20 minutes later. ``last_run_date`` acts as the per-day slot
        # marker without changing the existing delivery table schema.
        last_run_local = None
        if settings.last_run_date is not None:
            last_run_local = (
                settings.last_run_date.astimezone(timezone)
                if settings.last_run_date.tzinfo
                else settings.last_run_date.replace(tzinfo=timezone)
            )
        if last_run_local is not None and last_run_local.date() == delivery_date:
            last_time = last_run_local.time().replace(second=0, microsecond=0)
            if current_time < second_send_time or last_time >= second_send_time:
                return False

        row = (
            await db.execute(select(TomorrowPrintReportDelivery).where(TomorrowPrintReportDelivery.delivery_date == delivery_date))
        ).scalar_one_or_none()

        recipients = ensure_required_shtypi_recipient(normalize_recipients(settings.recipients))
        if not recipients["to"]:
            logger.warning("tomorrow_print_report_scheduler_skipped reason=no_to_recipients")
            return False
        try:
            logger.info(
                "tomorrow_print_report_scheduler_generating delivery_date=%s",
                delivery_date,
            )
            report = await build_tomorrow_print_report(delivery_date, include_attachment=True)
            logger.info(
                "tomorrow_print_report_scheduler_generated delivery_date=%s target_date=%s",
                delivery_date,
                report["target_date"],
            )
            if row is None:
                row = TomorrowPrintReportDelivery(
                    delivery_date=delivery_date,
                    target_date=datetime.fromisoformat(report["target_date"]).date(),
                    subject=report["subject"],
                    recipients=recipients,
                    status="PENDING",
                )
                db.add(row)
                await db.flush()
            else:
                row.target_date = datetime.fromisoformat(report["target_date"]).date()
                row.subject = report["subject"]
                row.recipients = recipients
            message = await send_tomorrow_print_report(report, recipients)
        except Exception as exc:
            if row is not None:
                row.status = "FAILED"
                row.last_error = str(exc)[:2000]
                await db.commit()
            logger.exception("tomorrow_print_report_scheduler_send_failed")
            return False

        row.status = "SENT"
        row.sent_at = datetime.now(timezone)
        row.gmail_message_id = message.get("id")
        row.gmail_thread_id = message.get("threadId")
        row.last_error = None
        settings.last_run_date = row.sent_at
        await db.commit()
        logger.info("tomorrow_print_report_scheduler_sent delivery_date=%s target_date=%s", delivery_date, row.target_date)
        return True


async def run_tomorrow_print_report_scheduler_forever() -> None:
    while True:
        try:
            await run_tomorrow_print_report_scheduler_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("tomorrow_print_report_scheduler_failed")
        await asyncio.sleep(30)
