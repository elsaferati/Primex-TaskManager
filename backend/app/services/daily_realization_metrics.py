from __future__ import annotations

from collections import Counter
from typing import Iterable, Mapping


def calculate_daily_metrics(rows: Iterable[Mapping[str, object]]) -> dict[str, int | float | None]:
    items = list(rows)
    outcomes = Counter(str(row.get("classification") or "") for row in items)
    original = sum(bool(row.get("in_original_plan")) for row in items)
    planned_done = outcomes["REALIZED_AS_PLANNED"]
    approved_scope = outcomes["POSTPONED_APPROVED"]
    adjusted_denominator = max(0, original - approved_scope)
    total_completed = sum(
        outcomes[name]
        for name in (
            "REALIZED_AS_PLANNED", "ADDITIONAL_COMPLETED", "COMPLETED_LATE", "COMPLETED_EARLY"
        )
    )
    raw = round(planned_done * 100.0 / original, 1) if original else None
    adjusted = round(planned_done * 100.0 / adjusted_denominator, 1) if adjusted_denominator else None
    deadline_rows = [row for row in items if row.get("deadline_was_today")]
    deadline_completed = sum(bool(row.get("deadline_completed")) for row in deadline_rows)
    deadline_postponed = sum(bool(row.get("postponed_today")) for row in deadline_rows)
    deadline_open = max(0, len(deadline_rows) - deadline_completed - deadline_postponed)
    overdue_open = sum(bool(row.get("deadline_is_overdue")) and not bool(row.get("deadline_completed")) for row in items)
    critical_rows = [row for row in deadline_rows if row.get("deadline_critical")]
    critical_completed = sum(bool(row.get("deadline_completed")) for row in critical_rows)
    critical_open = max(0, len(critical_rows) - critical_completed - sum(bool(row.get("postponed_today")) for row in critical_rows))
    action_required = any(bool(row.get("action_required")) for row in items) or deadline_open > 0 or overdue_open > 0
    return {
        "original_planned_count": original,
        "planned_completed_today_count": planned_done,
        "in_progress_count": outcomes["IN_PROGRESS"],
        "no_progress_count": outcomes["NO_PROGRESS"],
        "postponed_count": outcomes["POSTPONED_APPROVED"] + outcomes["POSTPONED_UNAPPROVED"],
        "approved_postponement_count": outcomes["POSTPONED_APPROVED"],
        "unapproved_postponement_count": outcomes["POSTPONED_UNAPPROVED"],
        "waiting_confirmation_count": outcomes["WAITING_CONFIRMATION"],
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
        "deadlines_today_count": len(deadline_rows),
        "deadlines_completed_count": deadline_completed,
        "deadlines_postponed_count": deadline_postponed,
        "deadlines_open_count": deadline_open,
        "overdue_open_count": overdue_open,
        "deadline_compliance_percentage": round(deadline_completed * 100.0 / len(deadline_rows), 1) if deadline_rows else None,
        "critical_deadlines_today_count": len(critical_rows),
        "critical_deadlines_completed_count": critical_completed,
        "critical_deadlines_open_count": critical_open,
        "daily_control_state": "ACTION_REQUIRED" if action_required else "CLEAN_DAY",
    }
