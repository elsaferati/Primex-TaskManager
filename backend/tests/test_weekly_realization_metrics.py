from app.services.realization_weekly_metrics import build_weekly_task_metrics


def task(task_id, attribution, classification="no_progress"):
    return {"task_id": task_id, "attribution": attribution, "classification": classification}


def test_extra_completions_count_toward_realization_and_open_extras_do_not():
    metrics = build_weekly_task_metrics([
        task("A", "planned_owner", "completed_on_time"),
        task("B", "planned_owner"),
        task("C", "additional_owner", "additional_completed"),
        task("D", "additional_owner"),
    ], [])
    assert metrics["weekly_planned_count"] == 2
    assert metrics["weekly_completed_count"] == 1
    assert metrics["weekly_all_completed_count"] == 2
    assert metrics["weekly_additional_count"] == 2
    assert metrics["weekly_progress_percent"] == 100


def test_extra_work_is_capped_at_full_realization():
    metrics = build_weekly_task_metrics([
        task("A", "planned_owner", "completed_on_time"),
        task("B", "additional_owner", "additional_completed"),
    ], [])
    assert metrics["weekly_progress_percent"] == 100


def test_same_task_across_snapshot_and_multiple_days_is_counted_once():
    timeline = [
        {"tasks": [task("A", "planned_today"), task("B", "added_after_weekly_plan", "completed")]},
        {"tasks": [task("A", "planned_today", "completed"), task("B", "added_after_weekly_plan", "completed")]},
    ]
    metrics = build_weekly_task_metrics([task("A", "planned_owner")], timeline)
    assert metrics["weekly_planned_count"] == 1
    assert metrics["weekly_completed_count"] == 1
    assert metrics["weekly_all_completed_count"] == 2
    assert metrics["weekly_additional_count"] == 1
    assert timeline[0]["completed_count"] == 0
    assert timeline[1]["completed_count"] == 1


def test_no_plan_uses_extra_work_as_denominator():
    metrics = build_weekly_task_metrics([], [{"tasks": [
        task("A", "completed_outside_weekly_plan", "completed"),
        task("B", "added_after_weekly_plan"),
    ]}])
    assert metrics["weekly_progress_percent"] == 50
    assert metrics["weekly_additional_count"] == 2
    assert build_weekly_task_metrics([], [])["weekly_progress_percent"] == 0


def test_final_completed_plan_is_preserved_when_daily_entry_is_older():
    metrics = build_weekly_task_metrics([task("A", "planned_owner", "completed_late")], [
        {"tasks": [task("A", "planned_today")]},
    ])
    assert metrics["weekly_completed_count"] == 1
    assert metrics["weekly_progress_percent"] == 100
