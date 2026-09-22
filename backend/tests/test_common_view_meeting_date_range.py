from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.api.routers.common_view import _meeting_display_dates


def _meeting(*, starts_at, ends_at, meeting_type="external"):
    return SimpleNamespace(
        starts_at=starts_at,
        ends_at=ends_at,
        created_at=None,
        meeting_type=meeting_type,
    )


def test_external_multi_day_meeting_is_visible_on_every_occupied_day():
    meeting = _meeting(
        starts_at=datetime(2026, 9, 21, 8, 0, tzinfo=timezone.utc),
        ends_at=datetime(2026, 9, 24, 15, 0, tzinfo=timezone.utc),
    )

    assert _meeting_display_dates(meeting) == [
        date(2026, 9, 21),
        date(2026, 9, 22),
        date(2026, 9, 23),
        date(2026, 9, 24),
    ]


def test_midnight_calendar_end_is_exclusive():
    meeting = _meeting(
        starts_at=datetime(2026, 9, 21, 0, 0, tzinfo=timezone.utc),
        ends_at=datetime(2026, 9, 25, 0, 0, tzinfo=timezone.utc),
    )

    assert _meeting_display_dates(meeting) == [
        date(2026, 9, 21),
        date(2026, 9, 22),
        date(2026, 9, 23),
        date(2026, 9, 24),
    ]


def test_same_day_external_meeting_remains_single_date():
    meeting = _meeting(
        starts_at=datetime(2026, 9, 21, 8, 0, tzinfo=timezone.utc),
        ends_at=datetime(2026, 9, 21, 9, 0, tzinfo=timezone.utc),
    )

    assert _meeting_display_dates(meeting) == [date(2026, 9, 21)]


def test_internal_meeting_is_not_expanded_even_when_it_has_an_end():
    meeting = _meeting(
        starts_at=datetime(2026, 9, 21, 8, 0, tzinfo=timezone.utc),
        ends_at=datetime(2026, 9, 24, 15, 0, tzinfo=timezone.utc),
        meeting_type="internal",
    )

    assert _meeting_display_dates(meeting) == [date(2026, 9, 21)]
