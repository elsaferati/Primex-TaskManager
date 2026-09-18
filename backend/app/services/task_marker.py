"""Keep the symbol shared by a note and its linked task representations."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ga_note import GaNote
from app.models.plan_note import PlanNote
from app.models.task import Task
GA_MARKER_EMAIL = "ga@primexeu.com"
MARKER_ROLLOVER_TIME = time(16, 0)
ONE_H_MARKER_SYMBOLS = {
    "EXCLAMATION": "!",
    "CLIENT_URGENT": "!!!",
    "QUESTION": "?",
    "KA": "KA",
    "GENT": "GENT",
    "M2": "M2",
    "M3": "M3",
    "M2_M3": "M2/M3",
    "FLAG": "⚑",
    "MONITOR": "👁",
    "CLOSE": "X",
}


def one_h_marker_label(marker: str | None, marker_by_ga: bool = False) -> str:
    symbol = ONE_H_MARKER_SYMBOLS.get((marker or "").strip().upper(), "")
    return f"({symbol})" if symbol and marker_by_ga else symbol


def _previous_friday(day: date) -> date:
    return day - timedelta(days=(day.weekday() - 4) % 7)


def _next_working_day(day: date) -> date:
    next_day = day + timedelta(days=1)
    while next_day.weekday() >= 5:
        next_day += timedelta(days=1)
    return next_day


def effective_marker_date(view_date: date, now: datetime | None = None) -> date:
    """Return the active symbol date, keeping Friday active until Monday 16:00."""
    if now is None:
        from app.config import settings

        now = datetime.now(ZoneInfo(settings.APP_TIMEZONE))
    if view_date != now.date():
        return view_date

    weekday = view_date.weekday()
    if weekday == 4:  # Friday never rolls over automatically.
        return view_date
    if weekday in {5, 6}:  # Weekend keeps Friday's symbols active.
        return _previous_friday(view_date)
    if weekday == 0 and now.time() < MARKER_ROLLOVER_TIME:
        return _previous_friday(view_date)
    if now.time() < MARKER_ROLLOVER_TIME:
        return view_date
    return _next_working_day(view_date)


def current_effective_marker_date(now: datetime | None = None) -> date:
    if now is None:
        from app.config import settings

        now = datetime.now(ZoneInfo(settings.APP_TIMEZONE))
    return effective_marker_date(now.date(), now)


def marker_is_by_ga(actor_email: str | None) -> bool:
    return (actor_email or "").strip().casefold() == GA_MARKER_EMAIL


def normalize_marker_comment(marker: str | None, comment: str | None) -> str | None:
    if not marker:
        return None
    normalized = (comment or "").strip()
    return normalized or None


def active_one_h_marker(item, report_date=None, now=None) -> str | None:
    marker = getattr(item, "one_h_marker", None)
    if marker and not hasattr(item, "one_h_marker_date"):
        return marker
    marker_date = getattr(item, "one_h_marker_date", None)
    if not marker or marker_date is None:
        return None
    target_date = (
        effective_marker_date(report_date, now)
        if report_date is not None
        else current_effective_marker_date(now)
    )
    return marker if marker_date == target_date else None


def active_one_h_marker_by_ga(item, report_date=None, now=None) -> bool:
    return bool(active_one_h_marker(item, report_date, now) and getattr(item, "one_h_marker_by_ga", False))


async def sync_note_task_marker(
    db: AsyncSession, note: GaNote | PlanNote, marker: str | None, *, actor_email: str | None = None,
    marker_comment: str | None = None,
) -> None:
    marker_date = current_effective_marker_date() if marker else None
    marker_by_ga = bool(marker and marker_is_by_ga(actor_email))
    marker_comment = normalize_marker_comment(marker, marker_comment)
    note.one_h_marker = marker
    note.one_h_marker_date = marker_date
    note.one_h_marker_by_ga = marker_by_ga
    note.one_h_marker_comment = marker_comment
    origin = Task.plan_note_origin_id if isinstance(note, PlanNote) else Task.ga_note_origin_id
    await db.execute(
        update(Task).where(origin == note.id, Task.is_active.is_(True)).values(
            one_h_marker=marker, one_h_marker_date=marker_date, one_h_marker_by_ga=marker_by_ga,
            one_h_marker_comment=marker_comment,
        )
    )


async def sync_task_marker(
    db: AsyncSession, task: Task, marker: str | None, *, actor_email: str | None = None,
    marker_comment: str | None = None,
) -> None:
    marker_date = current_effective_marker_date() if marker else None
    marker_by_ga = bool(marker and marker_is_by_ga(actor_email))
    marker_comment = normalize_marker_comment(marker, marker_comment)
    task.one_h_marker = marker
    task.one_h_marker_date = marker_date
    task.one_h_marker_by_ga = marker_by_ga
    task.one_h_marker_comment = marker_comment
    related = []
    if task.fast_task_group_id is not None:
        related.append(Task.fast_task_group_id == task.fast_task_group_id)
    for model, origin in ((GaNote, "ga_note_origin_id"), (PlanNote, "plan_note_origin_id")):
        note_id = getattr(task, origin, None)
        if note_id is not None:
            await db.execute(
                update(model).where(model.id == note_id).values(
                    one_h_marker=marker, one_h_marker_date=marker_date, one_h_marker_by_ga=marker_by_ga,
                    one_h_marker_comment=marker_comment,
                )
            )
            related.append(getattr(Task, origin) == note_id)
    if related:
        await db.execute(
            update(Task).where(or_(*related), Task.is_active.is_(True)).values(
                one_h_marker=marker, one_h_marker_date=marker_date, one_h_marker_by_ga=marker_by_ga,
                one_h_marker_comment=marker_comment,
            )
        )


def note_bundle_marker_update(note, payload, tasks) -> tuple[bool, str | None]:
    """Ignore unchanged editor fields; accept a symbol edit from either control."""
    if "one_h_marker" in payload.model_fields_set and payload.one_h_marker != active_one_h_marker(note):
        return True, payload.one_h_marker
    if "one_h_marker_comment" in payload.model_fields_set:
        shared_marker = payload.one_h_marker if "one_h_marker" in payload.model_fields_set else active_one_h_marker(note)
        if normalize_marker_comment(shared_marker, payload.one_h_marker_comment) != getattr(note, "one_h_marker_comment", None):
            return True, shared_marker
    by_assignee = {task.assigned_to: active_one_h_marker(task) for task in tasks if task.is_active}
    changed = {
        state.one_h_marker
        for state in payload.assignee_states or []
        if "one_h_marker" in state.model_fields_set
        and state.one_h_marker != by_assignee.get(state.assignee_id, active_one_h_marker(note))
    }
    if len(changed) > 1:
        raise ValueError("Choose one symbol for the linked note and tasks")
    return (True, changed.pop()) if changed else (False, None)
