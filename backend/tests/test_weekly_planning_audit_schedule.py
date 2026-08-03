from __future__ import annotations

import unittest

from app.celery_app import celery_app


class WeeklyPlanningAuditScheduleTests(unittest.TestCase):
    def test_all_five_friday_schedule_entries_exist(self) -> None:
        expected = {
            "weekly-planning-audit-0900": ("09:00",),
            "weekly-planning-audit-0930": ("09:30",),
            "weekly-planning-audit-1000": ("10:00",),
            "weekly-planning-audit-1030": ("10:30",),
            "weekly-planning-audit-1100": ("11:00",),
        }
        for name, args in expected.items():
            with self.subTest(name=name):
                entry = celery_app.conf.beat_schedule[name]
                self.assertEqual(entry["task"], "app.celery_tasks.send_weekly_planning_audit_report")
                self.assertEqual(entry["args"], args)
                self.assertIn("fri", str(entry["schedule"]))
        self.assertEqual(celery_app.conf.timezone, "Europe/Tirane")


if __name__ == "__main__":
    unittest.main()
