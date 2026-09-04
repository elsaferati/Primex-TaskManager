from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.microsoft_calendar_sync import (
    choose_department_id,
    graph_attendee_emails,
    graph_event_categories,
    graph_meeting_url,
    graph_platform,
    is_annual_leave_event,
    is_annual_leave_title_or_categories,
    microsoft_calendar_sync_window,
    parse_graph_datetime,
)


def test_parse_graph_datetime_normalizes_to_utc() -> None:
    parsed = parse_graph_datetime({"dateTime": "2026-09-04T14:30:00+02:00"})
    assert parsed == datetime(2026, 9, 4, 12, 30, tzinfo=timezone.utc)


def test_attendees_are_normalized_deduplicated_and_exclude_organizer() -> None:
    event = {
        "attendees": [
            {"emailAddress": {"address": "INFO@PRIMEXEU.COM"}},
            {"emailAddress": {"address": "User@PrimexEU.com"}},
            {"emailAddress": {"address": "user@primexeu.com"}},
        ]
    }
    assert graph_attendee_emails(event, "info@primexeu.com") == ["user@primexeu.com"]


def test_graph_platform_and_url_prefer_teams_join_url() -> None:
    event = {
        "isOnlineMeeting": True,
        "onlineMeeting": {"joinUrl": "https://teams.example/join"},
        "webLink": "https://outlook.example/event",
    }
    assert graph_platform(event) == "TEAMS"
    assert graph_meeting_url(event) == "https://teams.example/join"


def test_department_uses_majority_of_matched_attendees() -> None:
    dev_id = "dev"
    ga_id = "ga"
    participants = [
        SimpleNamespace(department_id=ga_id),
        SimpleNamespace(department_id=dev_id),
        SimpleNamespace(department_id=ga_id),
    ]
    departments = [
        SimpleNamespace(id=dev_id, code="DEV"),
        SimpleNamespace(id=ga_id, code="GA"),
    ]
    assert choose_department_id(participants, departments) == ga_id


def test_calendar_categories_are_normalized_and_pv_events_are_excluded() -> None:
    categorized = {"subject": "Annual leave", "categories": [" PV ", "Yellow category"]}
    titled = {"subject": "LH PV 31.08-11.09", "categories": []}
    unrelated = {"subject": "PVX client meeting", "categories": ["Blue category"]}

    assert graph_event_categories(categorized) == ["PV", "Yellow category"]
    assert is_annual_leave_event(categorized) is True
    assert is_annual_leave_event(titled) is True
    assert is_annual_leave_event(unrelated) is False
    assert is_annual_leave_title_or_categories("ESH PV 31.08-14.09.2026", []) is True
    assert is_annual_leave_title_or_categories("Annual leave", ["pv"]) is True
    assert is_annual_leave_title_or_categories("PVX client meeting", ["Blue category"]) is False


def test_calendar_sync_window_fetches_current_week_and_next_two_full_weeks(monkeypatch) -> None:
    now = datetime(2026, 9, 4, 8, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(
        "app.services.microsoft_calendar_sync.settings.MS_CALENDAR_SYNC_FUTURE_DAYS",
        14,
    )
    monkeypatch.setattr(
        "app.services.microsoft_calendar_sync.settings.APP_TIMEZONE",
        "Europe/Budapest",
    )

    start, end = microsoft_calendar_sync_window(now)

    # Monday 31 August at 00:00 through Friday 18 September in local time.
    # The end is exclusive, so it is Saturday 19 September at 00:00 locally.
    assert start == datetime(2026, 8, 30, 22, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 9, 18, 22, 0, tzinfo=timezone.utc)


def test_calendar_sync_window_is_stable_during_the_same_week(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.microsoft_calendar_sync.settings.MS_CALENDAR_SYNC_FUTURE_DAYS",
        14,
    )
    monkeypatch.setattr(
        "app.services.microsoft_calendar_sync.settings.APP_TIMEZONE",
        "UTC",
    )

    monday_window = microsoft_calendar_sync_window(
        datetime(2026, 8, 31, 1, 0, tzinfo=timezone.utc)
    )
    friday_window = microsoft_calendar_sync_window(
        datetime(2026, 9, 4, 20, 0, tzinfo=timezone.utc)
    )

    assert monday_window == friday_window
    assert monday_window == (
        datetime(2026, 8, 31, 0, 0, tzinfo=timezone.utc),
        datetime(2026, 9, 19, 0, 0, tzinfo=timezone.utc),
    )
