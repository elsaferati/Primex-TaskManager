from __future__ import annotations

import unittest
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

from app.services.meeting_system_tasks import (
    qualifies_for_tak_int_one_h_tasks,
    tak_int_post_one_h_slot,
    tak_int_pre_one_h_slot,
)

TZ = ZoneInfo("Europe/Budapest")


def _meeting(start: datetime, end: datetime | None = None, **extra) -> SimpleNamespace:
    values = {
        "meeting_type": "external",
        "recurrence_type": None,
        "calendar_sync_status": None,
        "starts_at": start,
        "ends_at": end,
    }
    values.update(extra)
    return SimpleNamespace(**values)


@patch("app.services.meeting_system_tasks.settings.APP_TIMEZONE", "Europe/Budapest")
class TestTakIntOneHSlots(unittest.TestCase):
    def test_pre_slot_is_last_slot_before_meeting(self) -> None:
        meeting = _meeting(datetime(2026, 10, 6, 13, 0, tzinfo=TZ))
        self.assertEqual(tak_int_pre_one_h_slot(meeting), (date(2026, 10, 6), "11:50"))

    def test_pre_slot_is_strictly_before_start(self) -> None:
        meeting = _meeting(datetime(2026, 10, 6, 11, 50, tzinfo=TZ))
        self.assertEqual(tak_int_pre_one_h_slot(meeting), (date(2026, 10, 6), "11:00"))

    def test_early_meeting_uses_previous_workday_last_slot(self) -> None:
        meeting = _meeting(datetime(2026, 10, 5, 8, 0, tzinfo=TZ))  # Monday
        self.assertEqual(tak_int_pre_one_h_slot(meeting), (date(2026, 10, 2), "16:00"))

    def test_post_slot_is_first_slot_after_meeting_ends(self) -> None:
        meeting = _meeting(datetime(2026, 10, 6, 13, 0, tzinfo=TZ), datetime(2026, 10, 6, 13, 30, tzinfo=TZ))
        self.assertEqual(tak_int_post_one_h_slot(meeting), (date(2026, 10, 6), "14:20"))

    def test_post_slot_defaults_to_one_hour_meeting(self) -> None:
        meeting = _meeting(datetime(2026, 10, 6, 9, 0, tzinfo=TZ))
        self.assertEqual(tak_int_post_one_h_slot(meeting), (date(2026, 10, 6), "10:00"))

    def test_late_meeting_post_slot_moves_to_next_workday(self) -> None:
        meeting = _meeting(datetime(2026, 10, 9, 16, 0, tzinfo=TZ))  # Friday
        self.assertEqual(tak_int_post_one_h_slot(meeting), (date(2026, 10, 12), "10:00"))

    def test_qualification(self) -> None:
        start = datetime(2026, 10, 6, 13, 0, tzinfo=TZ)
        self.assertTrue(qualifies_for_tak_int_one_h_tasks(_meeting(start)))
        self.assertFalse(qualifies_for_tak_int_one_h_tasks(_meeting(start, meeting_type="internal")))
        self.assertFalse(qualifies_for_tak_int_one_h_tasks(_meeting(start, recurrence_type="weekly")))
        self.assertFalse(qualifies_for_tak_int_one_h_tasks(_meeting(start, calendar_sync_status="cancelled")))


if __name__ == "__main__":
    unittest.main()
