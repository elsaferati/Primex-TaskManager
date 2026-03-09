import unittest
from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.models.enums import FrequencyType
from app.services.system_task_occurrences import (
    _is_occurrence_eligible_for_template,
    _template_start_date,
)


class TestSystemTaskOccurrenceCreationBoundary(unittest.TestCase):
    def test_template_start_date_uses_app_timezone_day(self) -> None:
        # 23:30 UTC is next day in Budapest (UTC+1 in February).
        tmpl = SimpleNamespace(created_at=datetime(2026, 2, 24, 23, 30, tzinfo=timezone.utc))
        self.assertEqual(_template_start_date(tmpl), date(2026, 2, 25))

    def test_monthly_day_after_today_first_shows_on_next_day(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.MONTHLY,
            day_of_week=None,
            days_of_week=None,
            day_of_month=25,
            month_of_year=None,
            created_at=datetime(2026, 2, 24, 9, 0, tzinfo=timezone.utc),
        )
        self.assertFalse(_is_occurrence_eligible_for_template(tmpl, date(2026, 2, 24)))
        self.assertTrue(_is_occurrence_eligible_for_template(tmpl, date(2026, 2, 25)))

    def test_monthly_day_before_today_not_created_as_late_for_current_month(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.MONTHLY,
            day_of_week=None,
            days_of_week=None,
            day_of_month=15,
            month_of_year=None,
            created_at=datetime(2026, 2, 24, 9, 0, tzinfo=timezone.utc),
        )
        # Would match monthly schedule, but must be blocked because it is before creation day.
        self.assertFalse(_is_occurrence_eligible_for_template(tmpl, date(2026, 2, 15)))
        # March 15, 2026 is Sunday, so the task shifts to Friday March 13.
        self.assertTrue(_is_occurrence_eligible_for_template(tmpl, date(2026, 3, 13)))
        self.assertFalse(_is_occurrence_eligible_for_template(tmpl, date(2026, 3, 15)))

    def test_existing_old_template_keeps_overdue_behavior(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.MONTHLY,
            day_of_week=None,
            days_of_week=None,
            day_of_month=15,
            month_of_year=None,
            created_at=datetime(2025, 1, 1, 0, 0, tzinfo=timezone.utc),
        )
        # February 15, 2026 is Sunday, so the recurring occurrence is created on Friday February 13.
        self.assertTrue(_is_occurrence_eligible_for_template(tmpl, date(2026, 2, 13)))


if __name__ == "__main__":
    unittest.main()
