from __future__ import annotations

import re


EMAIL_TASK_TITLE_RE = re.compile(r"\bEM\b", re.IGNORECASE)
EIGHT_AM_TITLE_RE = re.compile(r"\b0?8:00\b")


def title_has_eight_am_indicator(
    title: str | None, *, is_system_task: bool = False
) -> bool:
    """Recognize explicit 08:00 markers and non-system standalone EM markers."""
    value = title or ""
    return bool(
        EIGHT_AM_TITLE_RE.search(value)
        or (not is_system_task and EMAIL_TASK_TITLE_RE.search(value))
    )


def normalize_email_task_title(
    title: str | None, *, is_system_task: bool = False
) -> str:
    """Add one visible 08:00 prefix to a non-system standalone-EM task title."""
    normalized = (title or "").strip()
    if (
        not is_system_task
        and EMAIL_TASK_TITLE_RE.search(normalized)
        and not EIGHT_AM_TITLE_RE.search(normalized)
    ):
        return f"08:00 {normalized}"
    return normalized
