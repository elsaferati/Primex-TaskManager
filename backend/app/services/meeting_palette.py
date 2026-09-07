from __future__ import annotations

from collections.abc import Mapping
from typing import Any


MEETING_TONE_COLORS: dict[str, str] = {
    "meeting-violet": "#E5E7FB",
    "meeting-blue": "#DCECFF",
    "meeting-teal": "#CCEFF1",
    "meeting-yellow": "#FFE38F",
    "meeting-brown": "#C9A98A",
    "meeting-orange": "#FFD7AD",
    "meeting-red": "#FFD5DC",
}


def _value(source: Any, *names: str) -> Any:
    for name in names:
        if isinstance(source, Mapping) and name in source:
            return source[name]
        if hasattr(source, name):
            return getattr(source, name)
    return None


def meeting_report_tone(source: Any, *, meeting_type: str | None = None) -> str:
    """Return the Common View Outlook/Teams tone for a meeting payload or model."""
    raw_categories = _value(source, "calendar_categories", "calendarCategories") or []
    categories = [str(category).strip().casefold() for category in raw_categories if str(category).strip()]

    if any(any(token in category for token in ("daily", "weekly", "standup", "brown")) for category in categories):
        return "meeting-brown"
    if any("red" in category or "online" in category for category in categories):
        return "meeting-red"
    if any(category == "tak int" or "yellow" in category for category in categories):
        return "meeting-yellow"
    if any("orange" in category for category in categories):
        return "meeting-orange"
    if any(any(token in category for token in ("event", "evvent", "fizik")) for category in categories):
        return "meeting-teal"
    if any("purple" in category or "violet" in category for category in categories):
        return "meeting-violet"
    if any("blue" in category for category in categories):
        return "meeting-blue"

    resolved_type = str(meeting_type or _value(source, "meeting_type", "meetingType") or "external").strip().casefold()
    imported = bool(
        _value(source, "calendar_imported", "calendarImported")
        or _value(source, "microsoft_event_id", "microsoftEventId")
    )
    if imported:
        return "meeting-red"
    if resolved_type == "internal":
        return "meeting-yellow"
    recurrence = str(_value(source, "recurrence_type", "recurrenceType") or "").strip().casefold()
    if recurrence in {"daily", "weekly"}:
        return "meeting-brown"
    return "meeting-blue"


def meeting_report_color(source: Any, *, meeting_type: str | None = None) -> str:
    return MEETING_TONE_COLORS[meeting_report_tone(source, meeting_type=meeting_type)]
