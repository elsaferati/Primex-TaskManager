from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

from app.services.meeting_system_tasks import (
    EXTERNAL_MEETING_ASSIGNEE_NAMES,
    EXTERNAL_MEETING_TASK_DESCRIPTION,
    EXTERNAL_MEETING_TASK_KIND,
    EXTERNAL_MEETING_TASK_TITLE,
    external_meeting_task_title,
    is_one_time_external_meeting,
    meeting_occurrence_date,
    meeting_task_start_at,
)


class TestMeetingSystemTasks(unittest.TestCase):
    def test_one_time_external_meeting_qualifies(self) -> None:
        meeting = SimpleNamespace(
            meeting_type="external",
            recurrence_type=None,
            starts_at=datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc),
        )

        self.assertTrue(is_one_time_external_meeting(meeting))

    def test_recurring_external_meetings_do_not_qualify(self) -> None:
        for recurrence_type in ("weekly", "monthly", "yearly"):
            with self.subTest(recurrence_type=recurrence_type):
                meeting = SimpleNamespace(
                    meeting_type="external",
                    recurrence_type=recurrence_type,
                    starts_at=datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc),
                )

                self.assertFalse(is_one_time_external_meeting(meeting))

    def test_internal_meeting_does_not_qualify(self) -> None:
        meeting = SimpleNamespace(
            meeting_type="internal",
            recurrence_type=None,
            starts_at=datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc),
        )

        self.assertFalse(is_one_time_external_meeting(meeting))

    def test_meeting_task_is_at_0800_local_on_meeting_day(self) -> None:
        with patch("app.services.meeting_system_tasks.settings.APP_TIMEZONE", "Europe/Budapest"):
            meeting = SimpleNamespace(
                starts_at=datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc),
            )
            occurrence = meeting_occurrence_date(meeting)
            self.assertEqual(occurrence.isoformat(), "2026-06-03")

            start_at = meeting_task_start_at(occurrence)
            self.assertEqual(
                start_at.astimezone(ZoneInfo("Europe/Budapest")).strftime("%Y-%m-%d %H:%M"),
                "2026-06-03 08:00",
            )

    def test_external_meeting_task_title_includes_meeting_title_and_time(self) -> None:
        with patch("app.services.meeting_system_tasks.settings.APP_TIMEZONE", "Europe/Budapest"):
            meeting = SimpleNamespace(
                title="Client demo",
                starts_at=datetime(2026, 6, 3, 12, 30, tzinfo=timezone.utc),
            )

            self.assertEqual(
                external_meeting_task_title(meeting),
                "TESTIMI I AGENTAVE PARA TAK - Client demo 14:30",
            )

    def test_external_meeting_task_config(self) -> None:
        self.assertEqual(EXTERNAL_MEETING_TASK_KIND, "external_meeting_prepare")
        self.assertEqual(
            EXTERNAL_MEETING_ASSIGNEE_NAMES,
            ("Laurent Hoxha", "Endi Hyseni", "Elsa Ferati", "Rinesa Ahmedi"),
        )
        self.assertEqual(EXTERNAL_MEETING_TASK_TITLE, "TESTIMI I AGENTAVE PARA TAK")
        self.assertIn("1. Para çdo takimi extern", EXTERNAL_MEETING_TASK_DESCRIPTION)
        self.assertIn("Testimi i Agent", EXTERNAL_MEETING_TASK_DESCRIPTION)
        self.assertIn("Development Department", EXTERNAL_MEETING_TASK_DESCRIPTION)
        self.assertIn("\n2. Testimi bëhet", EXTERNAL_MEETING_TASK_DESCRIPTION)


if __name__ == "__main__":
    unittest.main()
