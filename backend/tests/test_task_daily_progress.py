import unittest
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from app.api.routers.planners import _override_daily_status_from_progress, _status_for_day
from app.models.enums import TaskStatus
from app.services.task_daily_progress import _derive_daily_status, upsert_explicit_task_daily_status


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


class TestCompletedTaskStatusForDay(unittest.TestCase):
    def test_completion_day_overrides_stale_in_progress_row(self) -> None:
        completed_at = datetime(2026, 8, 14, 9, 30, tzinfo=timezone.utc)

        self.assertEqual(
            _status_for_day(
                status="DONE",
                daily_status="IN_PROGRESS",
                completed_at=completed_at,
                day_date=date(2026, 8, 14),
            ),
            "DONE",
        )


class TestExplicitDailyStatusSync(unittest.IsolatedAsyncioTestCase):
    async def test_existing_progress_keeps_product_counts_and_becomes_done(self) -> None:
        existing = SimpleNamespace(
            completed_value=2,
            total_value=5,
            completed_delta=2,
            daily_status="IN_PROGRESS",
            finish_period="PM",
        )
        result = Mock()
        result.scalar_one_or_none.return_value = existing
        db = SimpleNamespace(execute=AsyncMock(return_value=result), add=Mock())

        await upsert_explicit_task_daily_status(
            db,
            task_id=uuid.uuid4(),
            day_date=date(2026, 8, 14),
            status=TaskStatus.DONE,
            finish_period="AM",
        )

        self.assertEqual(existing.daily_status, "DONE")
        self.assertEqual(existing.completed_value, 2)
        self.assertEqual(existing.total_value, 5)
        self.assertEqual(existing.completed_delta, 2)
        self.assertEqual(existing.finish_period, "PM")
        db.add.assert_not_called()


if __name__ == "__main__":
    unittest.main()
