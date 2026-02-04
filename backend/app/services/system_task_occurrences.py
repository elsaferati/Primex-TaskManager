from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_task_occurrence import SystemTaskOccurrence
from app.models.system_task_template import SystemTaskTemplate
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.services.system_task_schedule import matches_template_date


OPEN = "OPEN"
DONE = "DONE"
NOT_DONE = "NOT_DONE"
SKIPPED = "SKIPPED"


async def _assignee_ids_for_template(db: AsyncSession, template_id: uuid.UUID) -> list[uuid.UUID]:
    """Get assignees from assignee_ids array in template."""
    tmpl = (
        await db.execute(select(SystemTaskTemplate).where(SystemTaskTemplate.id == template_id))
    ).scalar_one_or_none()
    
    if not tmpl:
        return []
    
    # Get assignees from the array
    assignee_ids = tmpl.assignee_ids or []
    
    # Fallback to default_assignee_id if array is empty
    if not assignee_ids and tmpl.default_assignee_id:
        assignee_ids = [tmpl.default_assignee_id]
    
    return assignee_ids


async def ensure_occurrences_in_range(
    *,
    db: AsyncSession,
    start: date,
    end: date,
    template_ids: list[uuid.UUID] | None = None,
) -> None:
    """
    Ensure rows exist for all scheduled occurrences between [start, end] inclusive.

    This is idempotent and uses INSERT..ON CONFLICT DO NOTHING.
    """
    if end < start:
        return

    tmpl_stmt = select(SystemTaskTemplate).where(SystemTaskTemplate.is_active.is_(True))
    if template_ids:
        tmpl_stmt = tmpl_stmt.where(SystemTaskTemplate.id.in_(template_ids))
    templates = (await db.execute(tmpl_stmt)).scalars().all()
    if not templates:
        return

    now = datetime.now(timezone.utc)
    current = start
    while current <= end:
        for tmpl in templates:
            if not matches_template_date(tmpl, current):
                continue
            assignee_ids = await _assignee_ids_for_template(db, tmpl.id)
            if not assignee_ids:
                continue
            rows = [
                {
                    "id": uuid.uuid4(),
                    "template_id": tmpl.id,
                    "user_id": uid,
                    "occurrence_date": current,
                    "status": OPEN,
                    "created_at": now,
                    "updated_at": now,
                }
                for uid in assignee_ids
            ]
            stmt = pg_insert(SystemTaskOccurrence).values(rows)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=["template_id", "user_id", "occurrence_date"]
            )
            await db.execute(stmt)
        current += timedelta(days=1)


"""
NOTE:
Daily recurring tasks are configured to remain OPEN if missed, and show as overdue in Daily Report
until the user explicitly marks them DONE / NOT_DONE / SKIPPED.
"""

