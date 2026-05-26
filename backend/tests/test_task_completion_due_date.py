import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from app.api.routers.tasks import _sync_due_date_to_done_day, _task_planned_date
from app.models.enums import TaskStatus


class TestTaskCompletionDueDate(unittest.TestCase):
    def test_done_task_due_date_moves_to_completed_day(self) -> None:
        original_due = datetime(2026, 5, 29, 9, 0, tzinfo=timezone.utc)
        task = SimpleNamespace(
            status=TaskStatus.DONE.value,
            due_date=original_due,
            original_due_date=None,
            completed_at=datetime(2026, 5, 26, 14, 30, tzinfo=timezone.utc),
        )

        _sync_due_date_to_done_day(task)

        self.assertEqual(task.due_date, task.completed_at)
        self.assertEqual(task.original_due_date, original_due)

    def test_done_task_planned_date_uses_current_due_date(self) -> None:
        task = SimpleNamespace(
            status=TaskStatus.DONE.value,
            due_date=datetime(2026, 5, 26, 14, 30, tzinfo=timezone.utc),
            original_due_date=datetime(2026, 5, 29, 9, 0, tzinfo=timezone.utc),
            completed_at=datetime(2026, 5, 26, 14, 30, tzinfo=timezone.utc),
        )

        self.assertEqual(_task_planned_date(task), task.due_date)


if __name__ == "__main__":
    unittest.main()
