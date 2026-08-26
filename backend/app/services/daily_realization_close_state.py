from __future__ import annotations

from datetime import datetime


def resolve_daily_close_state(
    *,
    latest_action: str | None,
    close_created_at: datetime | None,
    latest_relevant_change: datetime | None,
    editable: bool,
) -> tuple[str, bool, bool]:
    """One status rule shared by Daily Report and live Daily Realization."""
    if latest_action == "REOPEN":
        return "REOPENED", False, False
    saved = latest_action in {"CLOSE", "CORRECT"}
    stale = bool(saved and close_created_at and latest_relevant_change and latest_relevant_change > close_created_at)
    if stale:
        return "STALE", True, True
    if saved:
        return "SAVED", True, False
    return ("NOT_SAVED" if editable else "CLOSED_EDIT_WINDOW"), False, False
