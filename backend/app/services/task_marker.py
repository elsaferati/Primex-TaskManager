"""Keep the symbol shared by a note and its linked task representations."""
from __future__ import annotations

from sqlalchemy import or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ga_note import GaNote
from app.models.plan_note import PlanNote
from app.models.task import Task


async def sync_note_task_marker(db: AsyncSession, note: GaNote | PlanNote, marker: str | None) -> None:
    note.one_h_marker = marker
    origin = Task.plan_note_origin_id if isinstance(note, PlanNote) else Task.ga_note_origin_id
    await db.execute(
        update(Task).where(origin == note.id, Task.is_active.is_(True)).values(one_h_marker=marker)
    )


async def sync_task_marker(db: AsyncSession, task: Task, marker: str | None) -> None:
    task.one_h_marker = marker
    related = []
    if task.fast_task_group_id is not None:
        related.append(Task.fast_task_group_id == task.fast_task_group_id)
    for model, origin in ((GaNote, "ga_note_origin_id"), (PlanNote, "plan_note_origin_id")):
        note_id = getattr(task, origin, None)
        if note_id is not None:
            await db.execute(update(model).where(model.id == note_id).values(one_h_marker=marker))
            related.append(getattr(Task, origin) == note_id)
    if related:
        await db.execute(
            update(Task).where(or_(*related), Task.is_active.is_(True)).values(one_h_marker=marker)
        )


def note_bundle_marker_update(note, payload, tasks) -> tuple[bool, str | None]:
    """Ignore unchanged editor fields; accept a symbol edit from either control."""
    if "one_h_marker" in payload.model_fields_set and payload.one_h_marker != note.one_h_marker:
        return True, payload.one_h_marker
    by_assignee = {task.assigned_to: task.one_h_marker for task in tasks if task.is_active}
    changed = {
        state.one_h_marker
        for state in payload.assignee_states or []
        if "one_h_marker" in state.model_fields_set
        and state.one_h_marker != by_assignee.get(state.assignee_id, note.one_h_marker)
    }
    if len(changed) > 1:
        raise ValueError("Choose one symbol for the linked note and tasks")
    return (True, changed.pop()) if changed else (False, None)
