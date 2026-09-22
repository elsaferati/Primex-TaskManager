from __future__ import annotations

from datetime import date, datetime, timedelta, tzinfo
from typing import Any


def _as_local(value: datetime | None, local_timezone: tzinfo) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(local_timezone)
    return value


def meeting_display_dates(meeting: Any, *, local_timezone: tzinfo) -> list[date]:
    """Return every local date occupied by a one-time meeting.

    Calendar TAK EXT events may span several days, while Microsoft calendar
    event ends are exclusive. PrimeFlow TAK INT meetings intentionally remain
    on their start date even if they have an end timestamp.
    """
    starts_at = getattr(meeting, "starts_at", None)
    date_source = starts_at or getattr(meeting, "created_at", None)
    local_start = _as_local(date_source, local_timezone)
    if local_start is None:
        return []

    start_day = local_start.date()
    ends_at = getattr(meeting, "ends_at", None)
    if str(getattr(meeting, "meeting_type", "") or "").lower() != "external" or ends_at is None:
        return [start_day]

    local_end = _as_local(ends_at, local_timezone)
    if local_end is None or local_end <= local_start:
        return [start_day]

    duration = ends_at - starts_at if starts_at is not None else None
    midnight_whole_days = bool(
        duration
        and duration.total_seconds() % (24 * 60 * 60) == 0
        and starts_at.hour == 0
        and starts_at.minute == 0
        and starts_at.second == 0
        and ends_at.hour == 0
        and ends_at.minute == 0
        and ends_at.second == 0
    )
    end_day = (
        ends_at.date() - timedelta(days=1)
        if midnight_whole_days
        else (local_end - timedelta(microseconds=1)).date()
    )
    if end_day <= start_day:
        return [start_day]

    return [
        start_day + timedelta(days=offset)
        for offset in range((end_day - start_day).days + 1)
    ]


def meeting_occurs_on_date(meeting: Any, day: date, *, local_timezone: tzinfo) -> bool:
    """Return whether a recurring or one-time meeting is shown on ``day``."""
    recurrence = str(getattr(meeting, "recurrence_type", "") or "").lower()
    if recurrence == "weekly":
        recurrence_days = getattr(meeting, "recurrence_days_of_week", None)
        return bool(recurrence_days and day.weekday() in recurrence_days)
    if recurrence == "monthly":
        recurrence_days = getattr(meeting, "recurrence_days_of_month", None)
        return bool(recurrence_days and day.day in recurrence_days)
    if recurrence == "yearly":
        starts_at = getattr(meeting, "starts_at", None)
        recurrence_days = getattr(meeting, "recurrence_days_of_month", None)
        month = starts_at.month if starts_at else None
        day_value = recurrence_days[0] if recurrence_days else None
        return bool(month and day_value and day.month == month and day.day == day_value)
    return day in meeting_display_dates(meeting, local_timezone=local_timezone)
