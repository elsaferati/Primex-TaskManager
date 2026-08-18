from __future__ import annotations

def ga_note_task_title(content: str | None) -> str:
    """Keep the complete GA/KA note as the canonical linked-task title."""
    normalized = (content or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return normalized or "GA/KA note task"


def ga_note_default_task_description(content: str | None) -> str | None:
    """Return the note body used as the default description of its task."""
    trimmed = (content or "").strip()
    return trimmed or None
