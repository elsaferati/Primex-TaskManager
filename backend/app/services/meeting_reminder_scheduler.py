from __future__ import annotations

import asyncio
import logging

from app.config import settings
from app.jobs.reminders import process_reminders


logger = logging.getLogger(__name__)


async def run_meeting_reminder_scheduler_forever() -> None:
    """Process meeting reminders without depending exclusively on Celery Beat.

    Reminder deliveries have a database uniqueness constraint, so this loop is
    safe while a Celery worker is also online.
    """
    interval_seconds = max(settings.MEETING_REMINDER_POLL_SECONDS, 10)
    while True:
        try:
            delivered = await process_reminders()
            if delivered:
                logger.info("meeting_reminders_delivered count=%s", delivered)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("meeting_reminder_scheduler_failed")
        await asyncio.sleep(interval_seconds)
