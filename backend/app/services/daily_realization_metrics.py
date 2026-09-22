from __future__ import annotations

from collections import Counter
from typing import Iterable, Mapping

COMPLETED_CLASSIFICATIONS = {"ADDITIONAL_COMPLETED", "COMPLETED_LATE", "COMPLETED_EARLY"}


def row_has_progress(row: Mapping[str, object]) -> bool:
    """Any sign the person moved the task forward, beyond a status label."""
    quantity = row.get("quantity")
    return bool(
        row.get("classification") == "IN_PROGRESS"
        or row.get("current_status") == "IN_PROGRESS"
        or float(row.get("progress_today") or 0) > 0
        or float(row.get("completed_delta") or 0) > 0
        or (quantity and quantity["source"] == "title" and quantity["completed"] > 0)
    )


def deadline_state(row: Mapping[str, object]) -> str:
    """The four mutually exclusive answers to "what happened to this deadline?"."""
    if row.get("deadline_completed"):
        return "COMPLETED"
    if row.get("postponed_today"):
        return "POSTPONED"
    return "IN_PROGRESS" if row_has_progress(row) else "NO_PROGRESS"


def deadline_task_card(row: Mapping[str, object], *, state: str, day: str | None = None) -> dict:
    """Row shown in the deadline popover of the daily and weekly tables."""
    return {
        "task_id": str(row["task_id"]) if row.get("task_id") else None,
        "title": str(row.get("title") or "Pa titull"),
        "day": day,
        "state": state,
        "critical": bool(row.get("deadline_critical")),
    }


DEADLINE_STATE_ORDER = {"NO_PROGRESS": 0, "POSTPONED": 1, "IN_PROGRESS": 2, "COMPLETED": 3}


def sort_deadline_cards(cards: list[dict]) -> list[dict]:
    """Unfinished and critical deadlines first, since those need an explanation."""
    return sorted(
        cards,
        key=lambda card: (
            DEADLINE_STATE_ORDER.get(card["state"], len(DEADLINE_STATE_ORDER)),
            not card["critical"],
            card.get("day") or "",
            card["title"],
        ),
    )


def calculate_daily_metrics(rows: Iterable[Mapping[str, object]]) -> dict[str, object]:
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
    extras = [row for row in items if not row.get("in_original_plan")]
    extra_completed = sum(
        row.get("classification") in {"ADDITIONAL_COMPLETED", "COMPLETED_LATE", "COMPLETED_EARLY"}
        for row in extras
    )
    extra_progress = sum(
        row.get("classification") not in COMPLETED_CLASSIFICATIONS and row_has_progress(row)
        for row in extras
    )
    raw = min(100.0, round(total_completed * 100.0 / original, 1)) if original else None
    adjusted = min(100.0, round(total_completed * 100.0 / adjusted_denominator, 1)) if adjusted_denominator else None
    deadline_rows = [row for row in items if row.get("deadline_was_today")]
    deadline_cards = [
        deadline_task_card(row, state=deadline_state(row)) for row in deadline_rows
    ]
    deadline_states = Counter(card["state"] for card in deadline_cards)
    deadline_completed = deadline_states["COMPLETED"]
    deadline_postponed = deadline_states["POSTPONED"]
    deadline_in_progress = deadline_states["IN_PROGRESS"]
    deadline_no_progress = deadline_states["NO_PROGRESS"]
    deadline_open = deadline_in_progress + deadline_no_progress
    overdue_open = sum(bool(row.get("deadline_is_overdue")) and not bool(row.get("deadline_completed")) for row in items)
    critical_rows = [row for row in deadline_rows if row.get("deadline_critical")]
    critical_completed = sum(bool(row.get("deadline_completed")) for row in critical_rows)
    critical_open = max(0, len(critical_rows) - critical_completed - sum(bool(row.get("postponed_today")) for row in critical_rows))
    action_required = any(bool(row.get("action_required")) for row in items) or deadline_open > 0 or overdue_open > 0
    quantities = [row["quantity"] for row in items if row.get("quantity") and row.get("classification") != "REASSIGNED_OUT"]
    quantity_planned = sum(int(quantity["planned"]) for quantity in quantities)
    quantity_completed = sum(int(quantity["completed"]) for quantity in quantities)
    return {
        "quantity_task_count": len(quantities),
        "quantity_planned_count": quantity_planned,
        "quantity_completed_count": quantity_completed,
        "quantity_delta": quantity_completed - quantity_planned,
        "original_planned_count": original,
        "planned_completed_today_count": planned_done,
        "in_progress_count": outcomes["IN_PROGRESS"],
        "no_progress_count": outcomes["NO_PROGRESS"],
        "postponed_count": outcomes["POSTPONED_APPROVED"] + outcomes["POSTPONED_UNAPPROVED"],
        "approved_postponement_count": outcomes["POSTPONED_APPROVED"],
        "unapproved_postponement_count": outcomes["POSTPONED_UNAPPROVED"],
        "waiting_confirmation_count": outcomes["WAITING_CONFIRMATION"],
        "additional_count": len(extras),
        "additional_completed_count": extra_completed,
        "additional_in_progress_count": extra_progress,
        "additional_no_progress_count": len(extras) - extra_completed - extra_progress,
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
        "deadline_tasks": sort_deadline_cards(deadline_cards),
        "deadlines_today_count": len(deadline_rows),
        "deadlines_completed_count": deadline_completed,
        "deadlines_postponed_count": deadline_postponed,
        "deadlines_in_progress_count": deadline_in_progress,
        "deadlines_no_progress_count": deadline_no_progress,
        "deadlines_open_count": deadline_open,
        "overdue_open_count": overdue_open,
        "deadline_compliance_percentage": round(deadline_completed * 100.0 / len(deadline_rows), 1) if deadline_rows else None,
        "critical_deadlines_today_count": len(critical_rows),
        "critical_deadlines_completed_count": critical_completed,
        "critical_deadlines_open_count": critical_open,
        "daily_control_state": "ACTION_REQUIRED" if action_required else "CLEAN_DAY",
    }
