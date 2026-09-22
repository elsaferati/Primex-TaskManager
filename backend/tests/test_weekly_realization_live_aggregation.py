import inspect

from app.api.routers.realization import _weekly_response


def test_week_rebuilds_every_working_day_live():
    """Daily snapshots freeze partial facts, so the week must re-read each day."""
    source = inspect.getsource(_weekly_response)

    assert "for current_day in sorted(working_days):" in source
    assert "await build_live_daily_realization(" in source


def test_system_schedule_attribution_survives_the_live_merge():
    source = inspect.getsource(_weekly_response)

    assert "merged_tasks[index] = {**system_task, **merged_tasks[index]}" in source
