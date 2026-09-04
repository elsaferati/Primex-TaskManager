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
