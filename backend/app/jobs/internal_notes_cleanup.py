from datetime import datetime, timedelta

from sqlalchemy import delete, func

from app.db import SessionLocal
from app.models.internal_note import InternalNote


RETENTION_DAYS = 7


async def cleanup_old_done_internal_notes() -> int:
    cutoff = datetime.utcnow() - timedelta(days=RETENTION_DAYS)
    done_time = func.coalesce(InternalNote.done_at, InternalNote.updated_at, InternalNote.created_at)

    async with SessionLocal() as db:
        result = await db.execute(
            delete(InternalNote).where(InternalNote.is_done.is_(True), done_time < cutoff)
        )
        await db.commit()
        return int(result.rowcount or 0)
