from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.models.internal_meeting_session import InternalMeetingSession
from app.services.internal_meeting_sessions import reset_internal_meeting_checklist


async def reset_expired_internal_meeting_sessions() -> int:
    now = datetime.now(timezone.utc)
    async with SessionLocal() as db:
        sessions = (
            await db.execute(
                select(InternalMeetingSession).where(
                    InternalMeetingSession.reset_at.is_(None),
                    InternalMeetingSession.ends_at <= now,
                )
            )
        ).scalars().all()

        for session in sessions:
            await reset_internal_meeting_checklist(db, checklist_id=session.checklist_id)
            session.reset_at = now

        if sessions:
            await db.commit()

        return len(sessions)
