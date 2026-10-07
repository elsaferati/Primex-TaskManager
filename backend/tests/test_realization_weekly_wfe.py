from datetime import date

from app.services.realization_weekly_metrics import build_weekly_task_metrics

WEEK = date(2026, 10, 5)


def _task(task_id, **values):
    return dict(task_id=task_id, title=task_id, created_date="2026-09-01", in_original_plan=True) | values


def test_weekly_wfe_task_counts_ninety_percent_without_penalty():
    timeline = [
        {"date": "2026-10-06", "tasks": [_task("a", classification="IN_PROGRESS", wfe=False),
                                         _task("b", classification="REALIZED_AS_PLANNED", current_status="DONE")]},
        {"date": "2026-10-07", "tasks": [_task("a", classification="NO_PROGRESS", wfe=True)]},
    ]
    metrics = build_weekly_task_metrics([], timeline, week_start=WEEK)
    assert metrics["weekly_wfe_count"] == 1
    assert metrics["weekly_penalty_points"] == 0
    assert metrics["weekly_progress_percent"] == 95.0


def test_weekly_wfe_uses_the_latest_day():
    timeline = [
        {"date": "2026-10-07", "tasks": [_task("a", classification="NO_PROGRESS", wfe=False)]},
        {"date": "2026-10-06", "tasks": [_task("a", classification="NO_PROGRESS", wfe=True)]},
    ]
    assert build_weekly_task_metrics([], timeline, week_start=WEEK)["weekly_wfe_count"] == 0
