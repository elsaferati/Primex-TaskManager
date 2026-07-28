from __future__ import annotations

from typing import Any

from app.models.enums import ProjectType


TT_TITLE_PREFIXES = ("TT ", "TT-", "TT:")


def normalized_project_title(project: Any) -> str:
    """Return the legacy title used to classify existing projects."""
    return (
        getattr(project, "title", None)
        or getattr(project, "name", None)
        or ""
    ).strip().upper()


def normalize_project_type(project_type: Any) -> str:
    if hasattr(project_type, "value"):
        project_type = project_type.value
    return str(project_type or "").strip().upper()


def normalized_project_type(project: Any) -> str:
    return normalize_project_type(getattr(project, "project_type", None))


def is_tt_project_title(title: str | None) -> bool:
    normalized = (title or "").strip().upper()
    return normalized == "TT" or normalized.startswith(TT_TITLE_PREFIXES)


def is_tt_project(project: Any) -> bool:
    return is_tt_project_title(normalized_project_title(project))


def has_mst_identity(project: Any) -> bool:
    """Preserve the existing MST rule: explicit type or MST anywhere in the title."""
    return has_mst_identity_fields(
        title=normalized_project_title(project),
        project_type=normalized_project_type(project),
    )


def has_mst_identity_fields(*, title: str | None, project_type: Any) -> bool:
    return (
        normalize_project_type(project_type) == ProjectType.MST.value
        or "MST" in (title or "").upper()
    )


def is_mst_project(project: Any) -> bool:
    """Return a strict MST classification, excluding legacy TT-prefixed projects."""
    return has_mst_identity(project) and not is_tt_project(project)


def is_mst_or_tt_project(project: Any) -> bool:
    return has_mst_identity(project) or is_tt_project(project)


def is_mst_or_tt_identity(title: str | None, project_type: Any) -> bool:
    """Classify callers that have identity fields but no Project-like object."""
    return (
        has_mst_identity_fields(title=title, project_type=project_type)
        or is_tt_project_title(title)
    )


def is_vs_or_vl_project_title(title: str | None) -> bool:
    """Preserve the existing VS/VL rule: either marker anywhere in the title."""
    normalized = (title or "").strip().upper()
    return "VS" in normalized or "VL" in normalized


def is_vs_or_vl_project(project: Any) -> bool:
    return is_vs_or_vl_project_title(normalized_project_title(project))
