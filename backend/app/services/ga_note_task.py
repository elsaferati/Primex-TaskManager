from __future__ import annotations

import re


def ga_note_task_title(content: str | None) -> str:
    """Build the canonical task title for a task created from a GA/KA note."""
    lines = [
        re.sub(r"[ \t\f\v]+", " ", line).strip()
        for line in (content or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    ]
    cleaned = [line for line in lines if line]
    if not cleaned:
        return "GA/KA note task"
    first_line = cleaned[0]
    if len(first_line) <= 100:
        return first_line
    return first_line[:100].rsplit(" ", 1)[0].rstrip(" ,;:-") or first_line[:100]


def ga_note_default_task_description(content: str | None) -> str | None:
    """Return the note body used as the default description of its task."""
    trimmed = (content or "").strip()
    return trimmed or None
