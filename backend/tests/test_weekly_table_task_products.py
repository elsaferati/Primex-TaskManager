import unittest

from app.api.routers.planners import _build_weekly_task_product_metrics


class TestWeeklyTableTaskProductMetrics(unittest.TestCase):
    def test_uses_progress_counts_for_day_when_available(self) -> None:
        total, completed, weekly, day_total, day_done = _build_weekly_task_product_metrics(
            base_total=50,
            base_completed=7,
            progress_counts=(12, 20),
            is_mst_tt_task=True,
            status_for_day="IN_PROGRESS",
        )

        self.assertEqual(total, 20)
        self.assertEqual(completed, 12)
        self.assertEqual(weekly, 50)
        self.assertEqual(day_total, 20)
        self.assertEqual(day_done, 12)

    def test_mst_tt_fallback_sets_zero_done_when_missing(self) -> None:
        total, completed, weekly, day_total, day_done = _build_weekly_task_product_metrics(
            base_total=40,
            base_completed=None,
            progress_counts=None,
            is_mst_tt_task=True,
            status_for_day="TODO",
        )

        self.assertEqual(total, 40)
        self.assertEqual(completed, 0)
        self.assertEqual(weekly, 40)
        self.assertEqual(day_total, 40)
        self.assertEqual(day_done, 0)

    def test_done_status_caps_done_to_total(self) -> None:
        total, completed, weekly, day_total, day_done = _build_weekly_task_product_metrics(
            base_total=30,
            base_completed=10,
            progress_counts=None,
            is_mst_tt_task=False,
            status_for_day="DONE",
        )

        self.assertEqual(total, 30)
        self.assertEqual(completed, 30)
        self.assertEqual(weekly, 30)
        self.assertEqual(day_total, 30)
        self.assertEqual(day_done, 30)


if __name__ == "__main__":
    unittest.main()
