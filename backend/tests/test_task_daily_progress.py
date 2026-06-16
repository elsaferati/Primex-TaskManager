import unittest

from app.api.routers.planners import _override_daily_status_from_progress
from app.models.enums import TaskStatus
from app.services.task_daily_progress import _derive_daily_status


class TestDeriveDailyStatus(unittest.TestCase):
    def test_zero_completed_is_todo(self) -> None:
        self.assertEqual(
            _derive_daily_status(old_completed=0, new_completed=0, total=3),
            TaskStatus.TODO,
        )

    def test_partial_completion_is_in_progress(self) -> None:
        self.assertEqual(
            _derive_daily_status(old_completed=0, new_completed=2, total=3),
            TaskStatus.IN_PROGRESS,
        )

    def test_full_completion_is_done(self) -> None:
        self.assertEqual(
            _derive_daily_status(old_completed=2, new_completed=3, total=3),
            TaskStatus.DONE,
        )


class TestOverrideDailyStatusFromProgress(unittest.TestCase):
    def test_complete_progress_overrides_stale_in_progress(self) -> None:
        self.assertEqual(
            _override_daily_status_from_progress(TaskStatus.IN_PROGRESS, (3, 3)),
            TaskStatus.DONE,
        )

    def test_incomplete_progress_keeps_daily_status(self) -> None:
        self.assertEqual(
            _override_daily_status_from_progress(TaskStatus.IN_PROGRESS, (2, 3)),
            TaskStatus.IN_PROGRESS,
        )

    def test_none_progress_keeps_daily_status(self) -> None:
        self.assertEqual(
            _override_daily_status_from_progress(TaskStatus.IN_PROGRESS, None),
            TaskStatus.IN_PROGRESS,
        )


if __name__ == "__main__":
    unittest.main()
