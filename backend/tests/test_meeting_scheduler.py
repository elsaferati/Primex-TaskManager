from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.integrations.microsoft import SCOPES
from app.schemas.meeting_scheduler import MeetingScheduleRequestCreate
from app.services.meeting_scheduler import meeting_occurrence_window, microsoft_schedule_conflicts


def _base_payload(**overrides):
    start = datetime.now(timezone.utc) + timedelta(days=2)
    values = {
        "title": "TAK EXT | Client | Demo",
        "meeting_type": "external",
        "starts_at": start,
        "ends_at": start + timedelta(hours=1),
        "client_email": "client@example.com",
        "department_id": "00000000-0000-0000-0000-000000000001",
        "participant_ids": ["00000000-0000-0000-0000-000000000002"],
    }
    values.update(overrides)
    return values


def test_external_request_requires_client_email() -> None:
    with pytest.raises(ValidationError):
        MeetingScheduleRequestCreate(**_base_payload(client_email=None))


def test_request_end_must_be_after_start() -> None:
    start = datetime.now(timezone.utc) + timedelta(days=2)
    with pytest.raises(ValidationError):
        MeetingScheduleRequestCreate(**_base_payload(starts_at=start, ends_at=start))


def test_calendar_write_scope_is_requested() -> None:
    assert "https://graph.microsoft.com/Calendars.ReadWrite" in SCOPES
    assert "https://graph.microsoft.com/Calendars.Read" not in SCOPES


def test_weekly_meeting_occurrence_preserves_time_and_duration() -> None:
    meeting = SimpleNamespace(
        starts_at=datetime(2026, 9, 1, 9, 30, tzinfo=timezone.utc),
        ends_at=datetime(2026, 9, 1, 10, 15, tzinfo=timezone.utc),
        recurrence_type="weekly",
        recurrence_days_of_week=[1],
        recurrence_days_of_month=None,
    )
    window = meeting_occurrence_window(meeting, datetime(2026, 9, 8, 8, 0, tzinfo=timezone.utc))
    assert window is not None
    assert window[1] - window[0] == timedelta(minutes=45)


def test_microsoft_busy_item_becomes_conflict() -> None:
    start = datetime(2026, 9, 4, 9, 0, tzinfo=timezone.utc)
    conflicts = microsoft_schedule_conflicts(
        [{
            "scheduleId": "person@primexeu.com",
            "scheduleItems": [{
                "status": "busy",
                "start": {"dateTime": "2026-09-04T09:15:00+00:00"},
                "end": {"dateTime": "2026-09-04T09:45:00+00:00"},
            }],
        }],
        starts_at=start,
        ends_at=start + timedelta(hours=1),
    )
    assert len(conflicts) == 1
    assert conflicts[0].source == "microsoft"
