from __future__ import annotations

import unittest
import uuid
from datetime import date, datetime, time, timezone

from app.services.ga_icloud_sync import (
    TimeRow,
    connection_id_from_token,
    generate_connection_token,
    hash_connection_token,
    prepare_calendar_item,
    prepare_reminder_item,
    resolve_timezone,
)


ROWS = [
    TimeRow(time(7, 30), time(8, 0)),
    TimeRow(time(8, 0), time(9, 0)),
    TimeRow(time(9, 0), time(10, 0)),
    TimeRow(time(10, 0), time(11, 0)),
    TimeRow(time(21, 0), time(22, 0)),
]


class TestGaIcloudSync(unittest.TestCase):
    def test_pairing_token_contains_connection_id_and_hashes_deterministically(self) -> None:
        connection_id = uuid.uuid4()
        token, digest = generate_connection_token(connection_id)

        self.assertEqual(connection_id_from_token(token), connection_id)
        self.assertEqual(hash_connection_token(token), digest)
        self.assertIsNone(connection_id_from_token("invalid"))

    def test_calendar_event_uses_local_day_and_containing_timetable_row(self) -> None:
        item = prepare_calendar_item(
            external_id="event-1",
            title="Customer call",
            starts_at=datetime(2026, 9, 7, 7, 15, tzinfo=timezone.utc),
            ends_at=datetime(2026, 9, 7, 8, 0, tzinfo=timezone.utc),
            is_all_day=False,
            calendar_name="ganimete.ar@gmail.com",
            location="Teams",
            zone=resolve_timezone("Europe/Berlin"),
            rows=ROWS,
        )

        self.assertEqual(item.day_date, date(2026, 9, 7))
        self.assertEqual((item.start_time, item.end_time), (time(9, 0), time(10, 0)))
        self.assertEqual(item.source_type, "calendar")
        self.assertIn("09:15–10:00", item.content)
        self.assertIn("Customer call", item.content)
        self.assertIn("Teams", item.content)

    def test_all_day_event_goes_to_untimed_day_row(self) -> None:
        item = prepare_calendar_item(
            external_id=None,
            title="Office closed",
            starts_at=datetime(2026, 9, 8),
            ends_at=None,
            is_all_day=True,
            calendar_name="ganimete.ar@gmail.com",
            location=None,
            zone=resolve_timezone("Europe/Berlin"),
            rows=ROWS,
        )

        self.assertEqual((item.start_time, item.end_time), (time(0, 0), time(0, 1)))
        self.assertEqual(item.content, "CALENDAR: Office closed")

    def test_timed_reminder_uses_slot_and_untimed_uses_comment_row(self) -> None:
        zone = resolve_timezone("Europe/Berlin")
        timed = prepare_reminder_item(
            external_id="reminder-1",
            title="Call supplier",
            due_at=datetime(2026, 9, 9, 8, 30, tzinfo=timezone.utc),
            due_date=None,
            reminder_list_name="REMINDER",
            notes=None,
            fallback_date=date(2026, 9, 7),
            zone=zone,
            rows=ROWS,
        )
        untimed = prepare_reminder_item(
            external_id="reminder-2",
            title="Review documents",
            due_at=None,
            due_date=date(2026, 9, 10),
            reminder_list_name="REMINDER",
            notes="Before lunch",
            fallback_date=date(2026, 9, 7),
            zone=zone,
            rows=ROWS,
        )

        self.assertEqual(timed.day_date, date(2026, 9, 9))
        self.assertEqual((timed.start_time, timed.end_time), (time(10, 0), time(11, 0)))
        self.assertIn("10:30", timed.content)
        self.assertEqual((untimed.start_time, untimed.end_time), (time(0, 0), time(0, 1)))
        self.assertIn("Before lunch", untimed.content)

    def test_undated_open_reminder_is_shown_on_sync_start_day(self) -> None:
        item = prepare_reminder_item(
            external_id="reminder-3",
            title="Unscheduled follow-up",
            due_at=None,
            due_date=None,
            reminder_list_name="REMINDER",
            notes=None,
            fallback_date=date(2026, 9, 7),
            zone=resolve_timezone("Europe/Berlin"),
            rows=ROWS,
        )

        self.assertEqual(item.day_date, date(2026, 9, 7))
        self.assertEqual(item.source_name, "REMINDER")


if __name__ == "__main__":
    unittest.main()
