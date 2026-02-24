import unittest
from datetime import date, datetime, timezone

from app.api.routers.reports import (
    _acted_on_report_day_in_tirana,
    _is_on_or_after_template_created_day,
    _tirana_day_utc_bounds,
)


class TestDailyReportSystemOccurrenceFilter(unittest.TestCase):
    def test_blocks_occurrence_before_creation_day(self) -> None:
        created_at = datetime(2026, 2, 24, 8, 0, tzinfo=timezone.utc)
        self.assertFalse(_is_on_or_after_template_created_day(date(2026, 2, 15), created_at))

    def test_allows_occurrence_on_and_after_creation_day(self) -> None:
        created_at = datetime(2026, 2, 24, 8, 0, tzinfo=timezone.utc)
        self.assertTrue(_is_on_or_after_template_created_day(date(2026, 2, 24), created_at))
        self.assertTrue(_is_on_or_after_template_created_day(date(2026, 2, 25), created_at))

    def test_allows_when_template_has_no_created_at(self) -> None:
        self.assertTrue(_is_on_or_after_template_created_day(date(2026, 2, 24), None))

    def test_tirana_day_utc_bounds(self) -> None:
        start_utc, end_utc = _tirana_day_utc_bounds(date(2026, 2, 24))
        # Tirana is UTC+1 in February.
        self.assertEqual(start_utc, datetime(2026, 2, 23, 23, 0, tzinfo=timezone.utc))
        self.assertEqual(end_utc, datetime(2026, 2, 24, 23, 0, tzinfo=timezone.utc))

    def test_acted_today_in_tirana_true_with_overdue_occurrence(self) -> None:
        # 2026-02-24 09:00 in Tirana => 08:00 UTC.
        acted_at = datetime(2026, 2, 24, 8, 0, tzinfo=timezone.utc)
        self.assertTrue(_acted_on_report_day_in_tirana(acted_at, date(2026, 2, 24)))

    def test_acted_today_in_tirana_false_for_next_local_day(self) -> None:
        # 23:30 UTC on Feb 24 is 00:30 on Feb 25 in Tirana.
        acted_at = datetime(2026, 2, 24, 23, 30, tzinfo=timezone.utc)
        self.assertFalse(_acted_on_report_day_in_tirana(acted_at, date(2026, 2, 24)))


if __name__ == "__main__":
    unittest.main()
