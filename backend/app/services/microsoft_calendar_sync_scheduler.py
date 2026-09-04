from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings
from app.db import SessionLocal
from app.services.microsoft_calendar_sync import (
    get_shared_calendar_token,
    sync_external_calendar_events,
)


logger = logging.getLogger(__name__)


async def run_microsoft_calendar_sync_once() -> None:
    if not settings.MS_REDIRECT_URI:
        return
    now = datetime.now(timezone.utc)
    async with SessionLocal() as db:
        token = await get_shared_calendar_token(db, redirect_uri=settings.MS_REDIRECT_URI)
        if token is None:
            return
        result = await sync_external_calendar_events(
            db,
            access_token=token.access_token,
            connected_by_user_id=token.user_id,
            start=now - timedelta(days=max(settings.MS_CALENDAR_SYNC_PAST_DAYS, 0)),
            end=now + timedelta(days=max(settings.MS_CALENDAR_SYNC_FUTURE_DAYS, 1)),
        )
        logger.info(
            "Microsoft calendar synchronized: fetched=%s created=%s updated=%s cancelled=%s skipped=%s",
            result.fetched,
            result.created,
            result.updated,
            result.cancelled,
            result.skipped,
        )


async def run_microsoft_calendar_sync_forever() -> None:
    interval_seconds = max(settings.MS_CALENDAR_SYNC_INTERVAL_MINUTES, 1) * 60
    while True:
        try:
            await run_microsoft_calendar_sync_once()
        except asyncio.CancelledError:
            raise
        except httpx.HTTPError:
            logger.exception("Microsoft calendar synchronization failed")
        except Exception:
            logger.exception("Unexpected Microsoft calendar synchronization failure")
        await asyncio.sleep(interval_seconds)
