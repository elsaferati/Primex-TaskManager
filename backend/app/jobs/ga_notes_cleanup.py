from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select, delete

from app.db import SessionLocal
from app.models.ga_note import GaNote
from app.models.enums import GaNoteStatus


async def cleanup_old_closed_ga_notes() -> int:
    """
    Delete closed GA/KA notes that were closed more than 1 month ago.
    Returns the number of notes deleted.
    """
    cutoff = datetime.utcnow() - timedelta(days=30)
    
    async with SessionLocal() as db:
        # Find all closed notes that were completed more than 1 month ago
        stmt = select(GaNote).where(
            GaNote.status == GaNoteStatus.CLOSED,
            GaNote.completed_at.isnot(None),
            GaNote.completed_at < cutoff,
        )
        result = await db.execute(stmt)
        notes_to_delete = result.scalars().all()
        
        if not notes_to_delete:
            return 0
        
        # Delete the notes
        delete_stmt = delete(GaNote).where(
            GaNote.status == GaNoteStatus.CLOSED,
            GaNote.completed_at.isnot(None),
            GaNote.completed_at < cutoff,
        )
        await db.execute(delete_stmt)
        await db.commit()
        
        return len(notes_to_delete)
