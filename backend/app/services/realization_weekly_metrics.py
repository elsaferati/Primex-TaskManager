from __future__ import annotations


def _identity(task: dict) -> str | None:
    if task.get("task_id"):
        return f"id:{task['task_id']}"
    return str(task.get("match_key") or "").strip() or None


def build_weekly_task_metrics(snapshot_tasks: list[dict], daily_timeline: list[dict]) -> dict[str, int | float]:
    """Deduplicate weekly obligations and refresh generated daily timeline counts."""
    expected_keys: set[str] = set()
    completed_expected_keys: set[str] = set()
    completed_keys: set[str] = set()
    additional_keys: set[str] = set()
    # Final snapshot facts remain the baseline even without daily snapshots.
    for task in snapshot_tasks:
        identity = _identity(task)
        if identity is None:
            continue
        attribution = task.get("attribution")
        is_completed = task.get("classification") in {
            "completed", "completed_on_time", "completed_late", "additional_completed"
        }
        if attribution == "planned_owner":
            expected_keys.add(identity)
            if is_completed:
                completed_expected_keys.add(identity)
        elif attribution in {"additional_owner", "completed_outside_weekly_plan"}:
            additional_keys.add(identity)
        if is_completed:
            completed_keys.add(identity)
    for timeline_item in daily_timeline:
        planned_today = 0
        completed_today = 0
        for task in timeline_item.get("tasks") or []:
            identity = _identity(task)
            if identity is None:
                continue
            attribution = task.get("attribution")
            is_expected = attribution in {"planned_today", "system_schedule"}
            is_completed = task.get("classification") == "completed"
            if is_expected:
                expected_keys.add(identity)
                planned_today += 1
                if is_completed:
                    completed_expected_keys.add(identity)
                    completed_today += 1
            elif attribution == "added_after_weekly_plan":
                additional_keys.add(identity)
            if is_completed:
                completed_keys.add(identity)
        timeline_item["planned_count"] = planned_today
        timeline_item["completed_count"] = completed_today
        timeline_item["daily_progress_percent"] = (
            round(completed_today * 100.0 / planned_today, 1)
            if planned_today
            else 0.0
        )
    additional_keys.update(completed_keys - expected_keys)
    additional_keys.difference_update(expected_keys)
    completed_expected_keys.update(completed_keys & expected_keys)
    metrics: dict[str, int | float] = {}
    metrics["weekly_planned_count"] = len(expected_keys)
    metrics["weekly_completed_count"] = len(completed_expected_keys)
    metrics["weekly_all_completed_count"] = len(completed_keys)
    metrics["weekly_additional_count"] = len(additional_keys)
    # Extra completions contribute to realization against the baseline plan.
    realization_base = len(expected_keys) or len(additional_keys)
    metrics["weekly_progress_percent"] = (
        min(100.0, round(len(completed_keys) * 100.0 / realization_base, 1))
        if realization_base
        else 0.0
    )
    return metrics
