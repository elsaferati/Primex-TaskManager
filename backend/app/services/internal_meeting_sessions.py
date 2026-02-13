from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.enums import ChecklistItemType
from app.models.internal_meeting_session import InternalMeetingSession

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover - fallback handled below
    ZoneInfo = None


ALLOWED_INTERNAL_MEETING_GROUP_KEYS = {
    "development_internal_meetings",
    "board",
    "staff",
}


def _pristina_tz():
    tz = None

    if ZoneInfo is not None:
        try:
            tz = ZoneInfo("Europe/Pristina")
        except Exception:
            try:
                tz = ZoneInfo("Europe/Belgrade")
            except Exception:
                tz = None

    if tz is None:
        try:
            import pytz

            try:
                tz = pytz.timezone("Europe/Pristina")
            except Exception:
                tz = pytz.timezone("Europe/Belgrade")
        except ImportError:
            tz = timezone(timedelta(hours=1))

    return tz


def _local_session_date(now_utc: datetime) -> date:
    return now_utc.astimezone(_pristina_tz()).date()


async def reset_internal_meeting_checklist(
    db: AsyncSession, *, checklist_id: uuid.UUID
) -> None:
    await db.execute(
        update(ChecklistItem)
        .where(
            ChecklistItem.checklist_id == checklist_id,
            ChecklistItem.item_type == ChecklistItemType.CHECKBOX,
        )
        .values(is_checked=False)
    )


async def ensure_internal_meeting_session(
    db: AsyncSession,
    *,
    checklist_id: uuid.UUID,
    duration_hours: int = 9,
    now_utc: datetime | None = None,
) -> InternalMeetingSession:
    now = now_utc or datetime.now(timezone.utc)
    session_date = _local_session_date(now)

    checklist = (
        await db.execute(select(Checklist).where(Checklist.id == checklist_id))
    ).scalar_one_or_none()
    if checklist is None:
        raise ValueError("Checklist not found")
    if checklist.group_key not in ALLOWED_INTERNAL_MEETING_GROUP_KEYS:
        raise ValueError("Checklist not eligible for internal meeting sessions")

    session = (
        await db.execute(
            select(InternalMeetingSession).where(
                InternalMeetingSession.checklist_id == checklist_id,
                InternalMeetingSession.session_date == session_date,
            )
        )
    ).scalar_one_or_none()

    if session is None:
        await reset_internal_meeting_checklist(db, checklist_id=checklist_id)
        session = InternalMeetingSession(
            checklist_id=checklist_id,
            session_date=session_date,
            starts_at=now,
            ends_at=now + timedelta(hours=duration_hours),
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        return session

    if session.reset_at is None and session.ends_at <= now:
        await reset_internal_meeting_checklist(db, checklist_id=checklist_id)
        session.reset_at = now
        await db.commit()
        await db.refresh(session)

    return session
