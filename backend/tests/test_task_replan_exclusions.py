import unittest
from datetime import date

from app.api.routers.tasks import _planner_replan_exclusion_days


class TestTaskReplanExclusions(unittest.TestCase):
    def test_hides_unworked_gap_after_latest_progress_day(self) -> None:
        days = _planner_replan_exclusion_days(
            old_start=date(2026, 5, 4),
            old_end=date(2026, 5, 8),
            new_start=date(2026, 5, 12),
            progress_days={date(2026, 5, 4), date(2026, 5, 5)},
            today=date(2026, 5, 6),
        )

        self.assertEqual(
            days,
            [date(2026, 5, 6), date(2026, 5, 7), date(2026, 5, 8)],
        )

    def test_keeps_worked_days_visible_when_replanned_same_week(self) -> None:
        days = _planner_replan_exclusion_days(
            old_start=date(2026, 5, 4),
            old_end=date(2026, 5, 8),
            new_start=date(2026, 5, 7),
            progress_days={date(2026, 5, 4), date(2026, 5, 5)},
            today=date(2026, 5, 6),
        )

        self.assertEqual(days, [date(2026, 5, 6)])

    def test_ignores_backwards_or_same_start_changes(self) -> None:
        days = _planner_replan_exclusion_days(
            old_start=date(2026, 5, 4),
            old_end=date(2026, 5, 8),
            new_start=date(2026, 5, 4),
            progress_days=set(),
            today=date(2026, 5, 6),
        )

        self.assertEqual(days, [])


if __name__ == "__main__":
    unittest.main()
