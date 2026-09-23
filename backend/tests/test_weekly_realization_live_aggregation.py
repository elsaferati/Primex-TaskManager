import inspect

from app.api.routers.realization import _weekly_response


def test_week_rebuilds_every_working_day_live():
    """Daily snapshots freeze partial facts, so the week must re-read each day."""
    source = inspect.getsource(_weekly_response)

    assert "for current_day in sorted(working_days):" in source
    assert "await build_live_daily_realization(" in source


def test_common_view_delay_and_absence_are_stamped_on_the_week():
    source = inspect.getsource(_weekly_response)

    assert 'attendance_type="VONESE"' in source
    assert 'attendance_type="MUNGESE"' in source
    assert "coverage.delay_days" in source
    assert "coverage.absence_days" in source


def test_system_schedule_attribution_survives_the_live_merge():
    source = inspect.getsource(_weekly_response)

    assert "merged_tasks[index] = {**system_task, **merged_tasks[index]}" in source


def test_a_full_week_of_live_pv_is_kept_on_the_week():
    """Daily PV used to vanish on the week because the person had no stored result."""
    source = inspect.getsource(_weekly_response)

    assert "live_availability" in source
    assert "availability_status_from_days(by_day, working_days=working_days)" in source
