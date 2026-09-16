from __future__ import annotations

import re


PERSONAL_OWNER_PREFIX = re.compile(
    r"^[A-Z]{1,5}(?:\s*[:/]\s*[A-Z]{1,5})*(?=\s|:|/|$)",
    re.IGNORECASE,
)


def personal_task_owner(value: str | None) -> str:
    """Classify a personal task once, using Genti > KA > GA > PX priority."""
    first_line = next(
        (line.strip() for line in str(value or "").splitlines() if line.strip()),
        "",
    )
    match = PERSONAL_OWNER_PREFIX.match(first_line)
    if match is None:
        return "PX"

    participants = {
        participant.strip().upper()
        for participant in re.split(r"[:/]", match.group(0))
        if participant.strip()
    }
    if participants.intersection({"GENT", "GENTI", "GT"}):
        return "GENT"
    if "KA" in participants:
        return "KA"
    if "GA" in participants:
        return "GA"
    return "PX"
