from __future__ import annotations

import re


EMAIL_TASK_TITLE_RE = re.compile(r"\bEM\b", re.IGNORECASE)
EIGHT_AM_TITLE_RE = re.compile(r"\b0?8:00\b")


def title_has_eight_am_indicator(title: str | None) -> bool:
    """Treat standalone EM markers as 08:00 even if the time was omitted."""
    value = title or ""
    return bool(EIGHT_AM_TITLE_RE.search(value) or EMAIL_TASK_TITLE_RE.search(value))


def normalize_email_task_title(title: str | None) -> str:
    """Add one visible 08:00 prefix to a standalone-EM task title."""
    normalized = (title or "").strip()
    if EMAIL_TASK_TITLE_RE.search(normalized) and not EIGHT_AM_TITLE_RE.search(normalized):
        return f"08:00 {normalized}"
    return normalized
