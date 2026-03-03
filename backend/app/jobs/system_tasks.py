from __future__ import annotations

from datetime import datetime, timezone

from app.db import SessionLocal
from app.services.system_task_instances import (
    ensure_slots_initialized,
    generate_system_task_instances,
)


async def generate_system_tasks() -> int:
    async with SessionLocal() as db:
        await ensure_slots_initialized(db)
        created = await generate_system_task_instances(db=db, now_utc=datetime.now(timezone.utc))
        await db.commit()
    return created
