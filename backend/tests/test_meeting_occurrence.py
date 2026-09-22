from datetime import date, datetime, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.services.meeting_occurrence import meeting_display_dates, meeting_occurs_on_date
from app.services.meetings_report import _meeting_occurs_on_date as report_meeting_occurs_on_date


LOCAL_TIMEZONE = ZoneInfo("Europe/Tirane")


def _meeting(
    *,
    starts_at: datetime,
    ends_at: datetime | None,
    meeting_type: str = "external",
    recurrence_type: str = "none",
    recurrence_days_of_week: list[int] | None = None,
    recurrence_days_of_month: list[int] | None = None,
):
    return SimpleNamespace(
        starts_at=starts_at,
        ends_at=ends_at,
        created_at=None,
        meeting_type=meeting_type,
        recurrence_type=recurrence_type,
        recurrence_days_of_week=recurrence_days_of_week,
        recurrence_days_of_month=recurrence_days_of_month,
    )


def test_multi_day_external_occurs_on_every_occupied_day() -> None:
    meeting = _meeting(
        starts_at=datetime(2026, 9, 21, 8, 0, tzinfo=timezone.utc),
        ends_at=datetime(2026, 9, 24, 15, 0, tzinfo=timezone.utc),
    )

    assert meeting_display_dates(meeting, local_timezone=LOCAL_TIMEZONE) == [
        date(2026, 9, 21),
        date(2026, 9, 22),
        date(2026, 9, 23),
        date(2026, 9, 24),
    ]
    for day in meeting_display_dates(meeting, local_timezone=LOCAL_TIMEZONE):
        assert meeting_occurs_on_date(meeting, day, local_timezone=LOCAL_TIMEZONE)
    assert not meeting_occurs_on_date(meeting, date(2026, 9, 25), local_timezone=LOCAL_TIMEZONE)


def test_m1_m2_m3_shared_report_helper_uses_multi_day_dates() -> None:
    meeting = _meeting(
        starts_at=datetime(2026, 9, 21, 8, 0, tzinfo=timezone.utc),
        ends_at=datetime(2026, 9, 24, 15, 0, tzinfo=timezone.utc),
    )

    assert report_meeting_occurs_on_date(meeting, date(2026, 9, 22))
    assert report_meeting_occurs_on_date(meeting, date(2026, 9, 24))
    assert not report_meeting_occurs_on_date(meeting, date(2026, 9, 25))


def test_midnight_calendar_end_remains_exclusive() -> None:
    meeting = _meeting(
        starts_at=datetime(2026, 9, 21, 0, 0, tzinfo=timezone.utc),
        ends_at=datetime(2026, 9, 25, 0, 0, tzinfo=timezone.utc),
    )

    assert meeting_display_dates(meeting, local_timezone=LOCAL_TIMEZONE)[-1] == date(2026, 9, 24)
    assert not meeting_occurs_on_date(meeting, date(2026, 9, 25), local_timezone=LOCAL_TIMEZONE)


def test_internal_meeting_stays_on_its_start_date() -> None:
    meeting = _meeting(
        starts_at=datetime(2026, 9, 21, 8, 0, tzinfo=timezone.utc),
        ends_at=datetime(2026, 9, 24, 15, 0, tzinfo=timezone.utc),
        meeting_type="internal",
    )

    assert meeting_display_dates(meeting, local_timezone=LOCAL_TIMEZONE) == [date(2026, 9, 21)]
    assert not meeting_occurs_on_date(meeting, date(2026, 9, 22), local_timezone=LOCAL_TIMEZONE)


def test_recurring_meeting_keeps_its_weekly_schedule() -> None:
    meeting = _meeting(
        starts_at=datetime(2026, 9, 21, 8, 0, tzinfo=timezone.utc),
        ends_at=None,
        recurrence_type="weekly",
        recurrence_days_of_week=[0, 2],
    )

    assert meeting_occurs_on_date(meeting, date(2026, 9, 21), local_timezone=LOCAL_TIMEZONE)
    assert meeting_occurs_on_date(meeting, date(2026, 9, 23), local_timezone=LOCAL_TIMEZONE)
    assert not meeting_occurs_on_date(meeting, date(2026, 9, 22), local_timezone=LOCAL_TIMEZONE)
