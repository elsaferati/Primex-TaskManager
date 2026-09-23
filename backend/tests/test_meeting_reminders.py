from datetime import datetime, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from app.api.access import ensure_meeting_participant_editor
from app.jobs.reminders import _delivery_insert, _next_occurrence, _reminder_is_due
from app.models.enums import NotificationType, UserRole
from app.models.meeting import Meeting
from app.models.notification import Notification
from app.services.notifications import notification_realtime_payload


def _meeting(**overrides):
    values = {
        "starts_at": datetime(2026, 9, 21, 10, 0, tzinfo=timezone.utc),
        "created_at": datetime(2026, 9, 1, tzinfo=timezone.utc),
        "meeting_type": "external",
        "recurrence_type": None,
        "recurrence_days_of_week": None,
        "recurrence_days_of_month": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_weekly_occurrence_uses_the_meeting_time() -> None:
    meeting = _meeting(recurrence_type="weekly", recurrence_days_of_week=[1])
    now = datetime(2026, 9, 22, 9, 30, tzinfo=timezone.utc)

    assert _next_occurrence(meeting, now, ZoneInfo("UTC")) == datetime(
        2026, 9, 22, 10, 0, tzinfo=timezone.utc
    )


def test_just_started_recurring_occurrence_stays_in_grace_window() -> None:
    meeting = _meeting(recurrence_type="weekly", recurrence_days_of_week=[1])
    now = datetime(2026, 9, 22, 10, 2, tzinfo=timezone.utc)

    assert _next_occurrence(meeting, now, ZoneInfo("UTC")) == datetime(
        2026, 9, 22, 10, 0, tzinfo=timezone.utc
    )


def test_reminder_due_window_includes_scheduler_delay_but_not_early_runs() -> None:
    occurrence = datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc)

    assert _reminder_is_due(
        occurrence=occurrence,
        current=datetime(2026, 9, 22, 9, 46, tzinfo=timezone.utc),
        minutes_before=15,
    ) is True
    assert _reminder_is_due(
        occurrence=occurrence,
        current=datetime(2026, 9, 22, 9, 44, tzinfo=timezone.utc),
        minutes_before=15,
    ) is False


def test_delivery_insert_is_conflict_safe() -> None:
    statement = str(_delivery_insert([{
        "id": "00000000-0000-0000-0000-000000000001",
        "meeting_id": "00000000-0000-0000-0000-000000000002",
        "user_id": "00000000-0000-0000-0000-000000000003",
        "occurrence_starts_at": datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc),
        "minutes_before": 15,
        "sent_at": datetime(2026, 9, 22, 9, 45, tzinfo=timezone.utc),
    }]))

    assert "ON CONFLICT" in statement


def test_realtime_notification_keeps_transport_and_business_types_distinct() -> None:
    row = Notification(
        user_id="00000000-0000-0000-0000-000000000001",
        type=NotificationType.reminder,
        title="PrimeFlow Meeting Reminder",
    )

    payload = notification_realtime_payload(row)

    assert payload["type"] == "notification"
    assert payload["notification_type"] == "reminder"


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.MANAGER])
def test_admin_and_manager_can_manage_meeting_participants(role: UserRole) -> None:
    ensure_meeting_participant_editor(
        SimpleNamespace(id="actor", role=role, department_id=None),
        SimpleNamespace(created_by="owner", department_id="department"),
    )


def test_department_member_can_manage_meeting_participants() -> None:
    ensure_meeting_participant_editor(
        SimpleNamespace(id="actor", role=UserRole.STAFF, department_id="department"),
        SimpleNamespace(created_by="owner", department_id="department"),
    )


def test_unrelated_user_cannot_manage_meeting_participants() -> None:
    with pytest.raises(HTTPException) as raised:
        ensure_meeting_participant_editor(
            SimpleNamespace(id="actor", role=UserRole.STAFF, department_id="other"),
            SimpleNamespace(created_by="owner", department_id="department"),
        )

    assert raised.value.status_code == 403


def test_meeting_relationship_exposes_only_manual_participants() -> None:
    join_clause = str(Meeting.participants.property.primaryjoin)

    assert "meeting_participants.assignment_source" in join_clause
