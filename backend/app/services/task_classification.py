from __future__ import annotations

import re
from typing import Any


_WHITESPACE_RE = re.compile(r"\s+")
# VS/VL template task titles (normalized). These are excluded from "fast task" logic.
VS_VL_TEMPLATE_TITLES: set[str] = {
    "analizimi dhe identifikimi i kolonave",
    "plotesimi i template-it te amazonit",
    "kalkulimi i cmimeve",
    "gjenerimi i fotove",
    "kontrollimi i prod. egzsistuese dhe postimi ne amazon",
    "ko1 e projektit vs",
    "ko2 e projektit vs",
    "dream robot vs",
    "dream robot vl",
    "kalkulimi i peshave",
}


def normalize_title(title: str | None) -> str:
    if not title:
        return ""
    return _WHITESPACE_RE.sub(" ", title.strip().lower())


def is_vs_vl_task_title(title: str | None) -> bool:
    return normalize_title(title) in VS_VL_TEMPLATE_TITLES


def is_fast_task_fields(
    *,
    title: str | None,
    project_id: Any | None,
    dependency_task_id: Any | None,
    system_template_origin_id: Any | None,
    ga_note_origin_id: Any | None,
) -> bool:
    """
    "Fast task" matches the planner's definition:
    - standalone (no project link, no dependency)
    - not a system task occurrence
    - includes GA/KA note-origin tasks when standalone
    - excludes VS/VL template titles
    """
    if project_id is not None:
        return False
    if dependency_task_id is not None:
        return False
    if system_template_origin_id is not None:
        return False
    if is_vs_vl_task_title(title):
        return False
    return True


def is_fast_task(task) -> bool:
    return is_fast_task_fields(
        title=getattr(task, "title", None),
        project_id=getattr(task, "project_id", None),
        dependency_task_id=getattr(task, "dependency_task_id", None),
        system_template_origin_id=getattr(task, "system_template_origin_id", None),
        ga_note_origin_id=getattr(task, "ga_note_origin_id", None),
    )
