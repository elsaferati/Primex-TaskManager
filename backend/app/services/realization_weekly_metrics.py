from __future__ import annotations

from datetime import date

from app.services.daily_realization_metrics import (
    deadline_task_card,
    sort_deadline_cards,
)

PLANNED_ATTRIBUTIONS = {"planned_owner", "planned_today", "system_schedule"}
ADDITIONAL_ATTRIBUTIONS = {
    "additional_owner", "completed_outside_weekly_plan", "added_after_weekly_plan",
}
COMPLETED_CLASSIFICATIONS = {
    "COMPLETED", "COMPLETED_ON_TIME", "COMPLETED_LATE", "COMPLETED_EARLY",
    "REALIZED_AS_PLANNED", "ADDITIONAL_COMPLETED",
}


def _identity(task: dict) -> str | None:
    if task.get("task_id"):
        return f"id:{task['task_id']}"
    return str(task.get("match_key") or task.get("title") or "").strip() or None


def _classification(task: dict) -> str:
    return str(task.get("classification") or "").strip().upper()


def _status(task: dict) -> str:
    return str(task.get("current_status") or task.get("status") or "").strip().upper()


def _is_completed(task: dict) -> bool:
    return _classification(task) in COMPLETED_CLASSIFICATIONS or _status(task) == "DONE"


def _is_postponed(task: dict) -> bool:
    return (
        _classification(task).startswith("POSTPONED")
        or bool(task.get("postponement"))
        # The push itself happened on a day of this week, whatever the day's
        # classification ended up being.
        or bool(task.get("postponed_today"))
    )


def _is_in_progress(task: dict) -> bool:
    return (
        _classification(task) in {"IN_PROGRESS", "ADDITIONAL_IN_PROGRESS"}
        or _status(task) == "IN_PROGRESS"
        or float(task.get("progress_today") or 0) > 0
        or float(task.get("completed_delta") or 0) > 0
    )


def _created_on_or_after(task: dict, week_start: date) -> bool | None:
    raw = str(task.get("created_date") or "")[:10]
    if not raw:
        return None
    try:
        return date.fromisoformat(raw) >= week_start
    except ValueError:
        return None


def _task_kind(task: dict, week_start: date | None = None) -> str | None:
    """Work born during the week is extra; work that predates it is the plan.

    The weekly plan snapshot cannot decide this, because it is sometimes
    captured mid-week and then already contains the week's new work.
    """
    if week_start is not None:
        created_during_week = _created_on_or_after(task, week_start)
        if created_during_week is not None:
            return "additional" if created_during_week else "planned"
    attribution = str(task.get("attribution") or "").strip()
    if attribution in PLANNED_ATTRIBUTIONS:
        return "planned"
    if attribution in ADDITIONAL_ATTRIBUTIONS:
        return "additional"
    # Live daily snapshots do not always carry the legacy attribution field.
    if task.get("in_original_plan") is True:
        return "planned"
    if task.get("in_original_plan") is False:
        return "additional"
    return None


def _prefer_state(previous: dict | None, current: dict) -> dict:
    """Keep the strongest useful state when a task occurs on several days."""
    if previous is None:
        return current
    def rank(task: dict) -> int:
        if _is_completed(task):
            return 3
        if _is_postponed(task):
            return 2
        if _is_in_progress(task):
            return 1
        return 0
    return current if rank(current) >= rank(previous) else previous


def build_weekly_task_metrics(
    snapshot_tasks: list[dict],
    daily_timeline: list[dict],
    *,
    week_start: date | None = None,
) -> dict[str, object]:
    """Aggregate unique obligations from the weekly snapshot and every daily snapshot."""
    planned_keys: set[str] = set()
    additional_keys: set[str] = set()
    states: dict[str, dict] = {}
    quantity_occurrences: dict[tuple[str, str], dict] = {}
    deadline_occurrences: dict[tuple[str, str], dict] = {}

    def collect(task: dict) -> str | None:
        identity = _identity(task)
        if identity is None:
            return None
        kind = _task_kind(task, week_start)
        if kind == "planned":
            planned_keys.add(identity)
        elif kind == "additional":
            additional_keys.add(identity)
        states[identity] = _prefer_state(states.get(identity), task)
        return identity

    for task in snapshot_tasks:
        collect(task)

    for timeline_item in daily_timeline:
        day = str(timeline_item.get("date") or "")
        planned_today: set[str] = set()
        completed_today: set[str] = set()
        for task in timeline_item.get("tasks") or []:
            identity = collect(task)
            if identity is not None and isinstance(task.get("quantity"), dict):
                quantity_occurrences[(day, identity)] = task["quantity"]
            if identity is not None and task.get("deadline_was_today"):
                deadline_occurrences[(day, identity)] = task
            if identity is None or _task_kind(task, week_start) != "planned":
                continue
            planned_today.add(identity)
            if _is_completed(task):
                completed_today.add(identity)
        timeline_item["planned_count"] = len(planned_today)
        timeline_item["completed_count"] = len(completed_today)
        timeline_item["daily_progress_percent"] = (
            round(len(completed_today) * 100.0 / len(planned_today), 1)
            if planned_today else 0.0
        )

    # A task known to belong to the plan can never also be an extra. Legacy data
    # without either marker is treated as extra only when it was completed.
    completed_keys = {key for key, task in states.items() if _is_completed(task)}
    additional_keys.update(completed_keys - planned_keys - additional_keys)
    additional_keys.difference_update(planned_keys)
    planned_completed = planned_keys & completed_keys
    additional_completed = additional_keys & completed_keys

    # Extra work that was added, never touched, and then pushed to a later date
    # was never this week's work. It belongs to the week it actually gets done,
    # so the week reports it apart instead of inflating its own extra count.
    additional_deferred = {
        key
        for key in additional_keys - additional_completed
        if _is_postponed(states[key]) and not _is_in_progress(states[key])
    }
    additional_keys -= additional_deferred

    additional_postponed = {
        key for key in additional_keys - additional_completed if _is_postponed(states[key])
    }
    additional_in_progress = {
        key for key in additional_keys - additional_completed - additional_postponed
        if _is_in_progress(states[key])
    }
    additional_todo = additional_keys - additional_completed - additional_postponed - additional_in_progress

    pending_planned = planned_keys - planned_completed
    planned_postponed = {key for key in pending_planned if _is_postponed(states[key])}
    planned_in_progress = {
        key for key in pending_planned - planned_postponed if _is_in_progress(states[key])
    }
    planned_no_progress = pending_planned - planned_postponed - planned_in_progress
    quantity_planned = sum(int(item.get("planned") or 0) for item in quantity_occurrences.values())
    quantity_completed = sum(int(item.get("completed") or 0) for item in quantity_occurrences.values())
    deadline_cards = []
    for (day, _task_key), task in deadline_occurrences.items():
        if task.get("deadline_completed"):
            state = "COMPLETED"
        elif task.get("postponed_today"):
            state = "POSTPONED"
        else:
            state = "IN_PROGRESS" if _is_in_progress(task) else "NO_PROGRESS"
        deadline_cards.append(deadline_task_card(task, state=state, day=day or None))
    deadlines_completed = sum(1 for card in deadline_cards if card["state"] == "COMPLETED")
    deadlines_postponed = sum(1 for card in deadline_cards if card["state"] == "POSTPONED")
    deadlines_in_progress = sum(1 for card in deadline_cards if card["state"] == "IN_PROGRESS")
    deadlines_no_progress = sum(1 for card in deadline_cards if card["state"] == "NO_PROGRESS")
    critical_deadlines = [task for task in deadline_occurrences.values() if task.get("deadline_critical")]
    critical_deadlines_completed = sum(1 for task in critical_deadlines if task.get("deadline_completed"))

    metrics: dict[str, object] = {
        "weekly_deadline_tasks": sort_deadline_cards(deadline_cards),
        "weekly_planned_count": len(planned_keys),
        "weekly_completed_count": len(planned_completed),
        "weekly_all_completed_count": len(planned_completed | additional_completed),
        "weekly_in_progress_task_count": len(planned_in_progress),
        "weekly_postponed_task_count": len(planned_postponed),
        "weekly_no_progress_task_count": len(planned_no_progress),
        "weekly_additional_count": len(additional_keys),
        "weekly_additional_deferred_count": len(additional_deferred),
        "weekly_additional_completed_count": len(additional_completed),
        "weekly_additional_in_progress_count": len(additional_in_progress),
        "weekly_additional_postponed_count": len(additional_postponed),
        "weekly_additional_todo_count": len(additional_todo),
        "weekly_additional_no_progress_count": len(additional_todo),
        "weekly_quantity_task_count": len(quantity_occurrences),
        "weekly_quantity_planned_count": quantity_planned,
        "weekly_quantity_completed_count": quantity_completed,
        "weekly_quantity_delta": quantity_completed - quantity_planned,
        "weekly_deadline_count": len(deadline_occurrences),
        "weekly_deadline_completed_count": deadlines_completed,
        "weekly_deadline_postponed_count": deadlines_postponed,
        "weekly_deadline_in_progress_count": deadlines_in_progress,
        "weekly_deadline_no_progress_count": deadlines_no_progress,
        "weekly_critical_deadline_count": len(critical_deadlines),
        "weekly_critical_deadline_completed_count": critical_deadlines_completed,
    }
    realization_base = len(planned_keys) or len(additional_keys)
    metrics["weekly_progress_percent"] = (
        min(100.0, round(len(completed_keys) * 100.0 / realization_base, 1))
        if realization_base else 0.0
    )
    return metrics


def build_weekly_question_metrics(daily_timeline: list[dict]) -> dict[str, int]:
    """Aggregate day-level counters used by the weekly automatic questions."""
    snapshot_days = [item for item in daily_timeline if item.get("has_snapshot")]
    return {
        "weekly_in_progress_count": sum(int(item.get("in_progress_count", 0) or 0) for item in snapshot_days),
        "weekly_no_progress_count": sum(int(item.get("no_progress_count", 0) or 0) for item in snapshot_days),
        "weekly_pending_count": sum(int(item.get("pending_count", 0) or 0) for item in snapshot_days),
        "weekly_fast_task_count": sum(int(item.get("fast_task_count", 0) or 0) for item in snapshot_days),
        "weekly_snapshot_days": len(snapshot_days),
    }
