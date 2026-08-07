from __future__ import annotations

import unittest

from app.celery_app import celery_app


class WeeklyPlanningAuditScheduleTests(unittest.TestCase):
    def test_only_approved_1030_friday_schedule_exists(self) -> None:
        names = [
            name for name in celery_app.conf.beat_schedule
            if name.startswith("weekly-planning-audit-") and name != "weekly-planning-audit-cleanup"
        ]
        self.assertEqual(names, ["weekly-planning-audit-1030"])
        entry = celery_app.conf.beat_schedule[names[0]]
        self.assertEqual(entry["task"], "app.celery_tasks.send_weekly_planning_audit_report")
        self.assertEqual(entry["args"], ("10:30",))
        self.assertIn("fri", str(entry["schedule"]))
        self.assertEqual(celery_app.conf.timezone, "Europe/Tirane")


if __name__ == "__main__":
    unittest.main()
