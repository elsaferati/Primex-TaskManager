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


def test_reminder_reaches_browser_without_redis(monkeypatch) -> None:
    import asyncio
    import uuid
    from app.services import notifications
    from app.websocket.manager import ConnectionManager

    class BrowserSocket:
        def __init__(self):
            self.messages = []

        async def send_json(self, message):
            self.messages.append(message)

    user_id = uuid.uuid4()
    other_user_id = uuid.uuid4()
    browser = BrowserSocket()
    other_browser = BrowserSocket()
    connections = ConnectionManager()
    monkeypatch.setattr(notifications, "manager", connections)
    monkeypatch.setattr(notifications.settings, "REDIS_ENABLED", False)
    row = Notification(user_id=user_id, type=NotificationType.reminder, title="Meeting test")

    async def exercise():
        await connections.connect(user_id, browser)
        await connections.connect(other_user_id, other_browser)
        await notifications.publish_notification(user_id=user_id, notification=row)

    asyncio.run(exercise())
    assert len(browser.messages) == 1
    assert browser.messages[0]["type"] == "notification"
    assert browser.messages[0]["notification_type"] == "reminder"
    assert other_browser.messages == []


def test_redis_delivery_does_not_send_duplicate_direct_message(monkeypatch) -> None:
    import asyncio
    import json
    import uuid
    from app.services import notifications

    publications = []

    class RedisClient:
        def publish(self, channel, payload):
            publications.append((channel, json.loads(payload)))

    class DirectManager:
        async def send_to_user(self, *_args):
            raise AssertionError("Redis listener handles delivery; do not also send directly")

    monkeypatch.setattr(notifications.settings, "REDIS_ENABLED", True)
    monkeypatch.setattr(notifications, "get_redis_sync", lambda: RedisClient())
    monkeypatch.setattr(notifications, "manager", DirectManager())
    user_id = uuid.uuid4()
    row = Notification(user_id=user_id, type=NotificationType.reminder, title="Meeting test")
    asyncio.run(notifications.publish_notification(user_id=user_id, notification=row))
    assert len(publications) == 1
    assert publications[0][1]["user_id"] == str(user_id)
    assert publications[0][1]["notification"]["notification_type"] == "reminder"


@pytest.mark.parametrize("canceled,already_delivered,expected", [(False, False, 1), (True, False, 0), (False, True, 0)])
def test_due_reminder_pipeline_commits_before_delivery(monkeypatch, canceled, already_delivered, expected) -> None:
    import asyncio
    import uuid
    from app.jobs import reminders

    user_id, meeting_id = uuid.uuid4(), uuid.uuid4()
    occurrence = datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc)
    current = datetime(2026, 9, 22, 9, 45, tzinfo=timezone.utc)
    meeting = _meeting(id=meeting_id, starts_at=occurrence, reminder_minutes_before=15,
                       title="Test meeting", meeting_url="https://example.com/meeting")
    rows = [[(meeting, user_id)], [(meeting_id, occurrence.date())] if canceled else [],
            [] if already_delivered else [(meeting_id, user_id, occurrence, 15)]]

    class Result:
        def __init__(self, values):
            self.values = values

        def all(self):
            return self.values

    class Database:
        committed = False
        notifications = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            pass

        async def execute(self, _statement):
            return Result(rows.pop(0))

        def add(self, notification):
            self.notifications.append(notification)

        async def commit(self):
            self.committed = True

    db = Database()
    publications = []

    async def publish(*, user_id, notification):
        assert db.committed
        publications.append((user_id, notification))

    monkeypatch.setattr(reminders, "SessionLocal", lambda: db)
    monkeypatch.setattr(reminders.settings, "APP_TIMEZONE", "UTC")
    monkeypatch.setattr(reminders, "publish_notification", publish)
    assert asyncio.run(reminders.process_reminders(now=current)) == expected
    assert len(publications) == expected
    assert len(db.notifications) == expected
    if expected:
        recipient, notification = publications[0]
        assert recipient == user_id
        assert notification.type == NotificationType.reminder
        assert notification.data["meeting_id"] == str(meeting_id)
        assert notification.data["open_url"] == meeting.meeting_url
