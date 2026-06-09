from __future__ import annotations

from datetime import datetime, timezone

from app.db import SessionLocal
from app.services.meeting_system_tasks import reconcile_external_meeting_system_tasks
from app.services.system_task_instances import (
    generate_system_task_instances,
)


async def generate_system_tasks() -> int:
    async with SessionLocal() as db:
        now_utc = datetime.now(timezone.utc)
        created = await generate_system_task_instances(db=db, now_utc=now_utc)
        created += await reconcile_external_meeting_system_tasks(db=db, now_utc=now_utc)
        await db.commit()
    return created


async def pregenerate_system_tasks_today() -> int:
    return await generate_system_tasks()


async def reconcile_system_task_slots_daily() -> dict[str, int]:
    created = await generate_system_tasks()
    return {"rewound_slots": 0, "created_tasks": created}
