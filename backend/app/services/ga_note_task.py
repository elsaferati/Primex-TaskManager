from __future__ import annotations

import re


def ga_note_task_title(content: str | None) -> str:
    """Build the canonical task title for a task created from a GA/KA note."""
    lines = [
        re.sub(r"[ \t\f\v]+", " ", line).strip()
        for line in (content or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    ]
    cleaned = "\n".join(line for line in lines if line)
    return cleaned or "GA/KA note task"


def ga_note_default_task_description(content: str | None) -> str | None:
    """Return the note body used as the default description of its task."""
    trimmed = (content or "").strip()
    return trimmed or None
