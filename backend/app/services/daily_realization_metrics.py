from __future__ import annotations

from collections import Counter
from typing import Iterable, Mapping


def calculate_daily_metrics(rows: Iterable[Mapping[str, object]]) -> dict[str, int | float | None]:
    items = list(rows)
    outcomes = Counter(str(row.get("classification") or "") for row in items)
    original = sum(bool(row.get("in_original_plan")) for row in items)
    planned_done = outcomes["REALIZED_AS_PLANNED"]
    approved_scope = sum(
        outcomes[name]
        for name in ("POSTPONED_APPROVED",)
    ) + sum(
        1 for row in items
        if row.get("in_original_plan") and row.get("adjustment_status") == "APPROVED"
        and row.get("classification") in {"REMOVED_FROM_PLAN", "REASSIGNED_OUT"}
    )
    adjusted_denominator = max(0, original - approved_scope)
    total_completed = sum(
        outcomes[name]
        for name in (
            "REALIZED_AS_PLANNED", "ADDITIONAL_COMPLETED", "COMPLETED_LATE", "COMPLETED_EARLY"
        )
    )
    raw = round(planned_done * 100.0 / original, 1) if original else None
    adjusted = round(planned_done * 100.0 / adjusted_denominator, 1) if adjusted_denominator else None
    return {
        "original_planned_count": original,
        "planned_completed_today_count": planned_done,
        "in_progress_count": outcomes["IN_PROGRESS"],
        "no_progress_count": outcomes["NO_PROGRESS"],
        "postponed_count": outcomes["POSTPONED_APPROVED"] + outcomes["POSTPONED_UNAPPROVED"],
        "approved_postponement_count": outcomes["POSTPONED_APPROVED"],
        "unapproved_postponement_count": outcomes["POSTPONED_UNAPPROVED"],
        "waiting_confirmation_count": outcomes["WAITING_CONFIRMATION"],
        "blocked_count": outcomes["BLOCKED"],
        "additional_completed_count": outcomes["ADDITIONAL_COMPLETED"],
        "completed_late_count": outcomes["COMPLETED_LATE"],
        "completed_early_count": outcomes["COMPLETED_EARLY"],
        "reopened_count": outcomes["REOPENED"],
        "reassigned_out_count": outcomes["REASSIGNED_OUT"],
        "reassigned_in_count": outcomes["REASSIGNED_IN"],
        "total_completed_today_count": total_completed,
        "adjusted_exclusion_count": approved_scope,
        "adjusted_denominator": adjusted_denominator,
        "raw_plan_realization": raw,
        "adjusted_plan_realization": adjusted,
    }
