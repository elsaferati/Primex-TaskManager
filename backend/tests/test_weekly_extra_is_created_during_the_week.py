import inspect
from datetime import date

from app.api.routers.realization import _weekly_response
from app.services.realization_weekly_metrics import build_weekly_task_metrics

WEEK_START = date(2026, 9, 14)


def _task(task_id: str, created: str, *, attribution: str) -> dict:
    return {
        "task_id": task_id,
        "title": task_id,
        "created_date": created,
        "attribution": attribution,
        "current_status": "TODO",
    }


def test_work_born_during_the_week_is_extra_even_if_the_plan_snapshot_holds_it():
    """A plan captured mid-week already contains the week's new work."""
    snapshot_tasks = [
        _task("existed-before", "2026-09-08", attribution="planned_today"),
        # Captured into the plan on Friday, but it did not exist on Monday.
        _task("born-wednesday", "2026-09-16", attribution="planned_today"),
    ]

    metrics = build_weekly_task_metrics(snapshot_tasks, [], week_start=WEEK_START)

    assert metrics["weekly_planned_count"] == 1
    assert metrics["weekly_additional_count"] == 1


def test_work_that_predates_the_week_counts_as_plan_even_without_attribution():
    snapshot_tasks = [_task("old", "2026-09-01", attribution="added_after_weekly_plan")]

    metrics = build_weekly_task_metrics(snapshot_tasks, [], week_start=WEEK_START)

    assert metrics["weekly_planned_count"] == 1
    assert metrics["weekly_additional_count"] == 0


def test_attribution_still_decides_when_the_creation_date_is_unknown():
    snapshot_tasks = [
        {"task_id": "a", "attribution": "added_after_weekly_plan", "current_status": "TODO"},
    ]

    metrics = build_weekly_task_metrics(snapshot_tasks, [], week_start=WEEK_START)

    assert metrics["weekly_additional_count"] == 1


def test_an_extra_never_started_and_pushed_later_is_left_out_of_the_week():
    """It was not this week's work; it belongs to the week it gets done."""
    snapshot_tasks = [
        {
            "task_id": "parked",
            "created_date": "2026-09-16",
            "current_status": "TODO",
            "postponed_today": True,
        },
    ]

    metrics = build_weekly_task_metrics(snapshot_tasks, [], week_start=WEEK_START)

    assert metrics["weekly_additional_count"] == 0
    assert metrics["weekly_additional_deferred_count"] == 1


def test_a_pushed_extra_that_was_worked_on_still_counts():
    snapshot_tasks = [
        {
            "task_id": "started",
            "created_date": "2026-09-16",
            "current_status": "IN_PROGRESS",
            "postponed_today": True,
        },
    ]

    metrics = build_weekly_task_metrics(snapshot_tasks, [], week_start=WEEK_START)

    assert metrics["weekly_additional_count"] == 1
    assert metrics["weekly_additional_deferred_count"] == 0


def test_an_untouched_extra_that_was_never_pushed_still_counts():
    snapshot_tasks = [
        {"task_id": "waiting", "created_date": "2026-09-16", "current_status": "TODO"},
    ]

    metrics = build_weekly_task_metrics(snapshot_tasks, [], week_start=WEEK_START)

    assert metrics["weekly_additional_count"] == 1
    assert metrics["weekly_additional_deferred_count"] == 0


def test_creation_dates_come_from_the_database_not_from_the_snapshot():
    source = inspect.getsource(_weekly_response)

    assert "creation_days = await _task_creation_days(db, weekly_tasks)" in source
    assert "week_start=period.start_date" in source


def test_the_week_reports_when_its_plan_was_photographed():
    source = inspect.getsource(_weekly_response)

    assert "planned_snapshot_captured_day=planned_captured_day" in source
