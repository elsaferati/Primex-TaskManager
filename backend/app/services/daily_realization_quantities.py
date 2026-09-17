from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from app.config import settings
from app.services.task_product_counts import task_product_counts
from app.services.task_strike_events import CHECKLIST_ITEM, DONE_BLOCK, TECHNICAL_TAGS, count_struck_points_for_day


TITLE_QUANTITY = re.compile(r"(?<![\d/])(\d+)\s*/\s*(\d+)(?![\d/])")


def title_planned_quantity(title: str | None) -> int | None:
    # The smaller side is the daily target: 2/17 -> 2 and 40/4 -> 4.
    cleaned = TECHNICAL_TAGS.sub("", title or "")
    heading = cleaned.splitlines()[0] if cleaned else ""
    match = TITLE_QUANTITY.search(heading)
    if not match:
        return None
    planned = min(int(match.group(1)), int(match.group(2)))
    return planned if planned > 0 else None


def _local_day(value: datetime | None) -> date | None:
    if value is None:
        return None
    aware = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    return aware.astimezone(ZoneInfo(settings.REALIZATION_TIMEZONE)).date()


def daily_task_quantity(
    task: Any, *, day: date, baseline: dict | None = None,
    progress: Any = None, strike_events: Iterable[Any] = (), done_for_day: bool = False,
) -> dict | None:
    title = getattr(task, "title", None) or (baseline or {}).get("title")
    planned = title_planned_quantity(title)
    if planned is not None:
        description = getattr(task, "description", None) or ""
        # Note copies can repeat their title in the description. Use a single
        # checklist so the same points cannot contribute twice.
        has_title_points = bool(CHECKLIST_ITEM.search(TECHNICAL_TAGS.sub("", title or "")))
        has_description_points = bool(CHECKLIST_ITEM.search(TECHNICAL_TAGS.sub("", description)) or DONE_BLOCK.search(description))
        field = "TITLE" if has_title_points or DONE_BLOCK.search(title or "") or not has_description_points else "DESCRIPTION"
        text = title if field == "TITLE" else description
        scheduled_day = _local_day(getattr(task, "due_date", None))
        legacy_day = day == scheduled_day or day == _local_day(getattr(task, "completed_at", None))
        done = count_struck_points_for_day(text, strike_events, day=day, field_name=field, allow_undated=legacy_day)
        progress_done = progress is not None and str(getattr(progress, "daily_status", "") or "").upper() == "DONE"
        completed_on_day = _local_day(getattr(task, "completed_at", None)) == day
        # DONE is authoritative even when point strikes are partial or absent.
        if done_for_day or progress_done or completed_on_day:
            done = planned
        # Striking the whole single-line heading means all its planned units.
        if field == "TITLE" and not has_title_points and done and any(
            " ".join(match.group(1).split()) == " ".join(TECHNICAL_TAGS.sub("", title or "").split())
            for match in DONE_BLOCK.finditer(title or "")
        ):
            done = planned
        return {"source": "title", "planned": planned, "completed": done, "delta": done - planned}

    # CONTROL and personal tasks can carry copied product totals; production
    # quantities belong only to PRODUCT tasks inside a project.
    if not getattr(task, "project_id", None) or str(getattr(task, "phase", "") or "").upper() != "PRODUCT":
        return None
    counts = task_product_counts(task)
    if counts is None:
        return None
    planned, done = counts
    if progress is not None and (getattr(progress, "total_value", 0) or 0) > 0:
        planned = int(progress.total_value)
        done = max(0, int(progress.completed_value or 0))
    elif day not in {_local_day(getattr(task, "due_date", None)), _local_day(getattr(task, "completed_at", None))}:
        # Live cumulative notes must not leak work into a different report day.
        done = 0
    progress_done = progress is not None and str(getattr(progress, "daily_status", "") or "").upper() == "DONE"
    completed_on_day = _local_day(getattr(task, "completed_at", None)) == day
    if done_for_day or progress_done or completed_on_day:
        done = planned
    return {"source": "products", "planned": planned, "completed": done, "delta": done - planned}
