import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from app.api.routers.tasks import (
    _as_utc_datetime,
    _normalize_ga_note_task_status,
    _requires_rlz_completion_comment,
    _supports_waiting_confirmation,
    _sync_due_date_to_done_day,
    _task_planned_date,
)
from app.models.enums import TaskStatus


class TestTaskCompletionDueDate(unittest.TestCase):
    def test_date_input_can_be_compared_with_a_stored_task_date(self) -> None:
        # A browser date input becomes a timezone-naive datetime, while dates
        # loaded from PostgreSQL are timezone-aware.
        date_input = datetime(2026, 8, 12)
        stored_due_date = datetime(2026, 8, 13, tzinfo=timezone.utc)

        normalized_input = _as_utc_datetime(date_input)

        self.assertEqual(normalized_input, datetime(2026, 8, 12, tzinfo=timezone.utc))
        self.assertLess(normalized_input, stored_due_date)

    def test_independent_note_copies_do_not_require_an_rlz_comment_to_complete(self) -> None:
        for origin_field in ("ga_note_origin_id", "plan_note_origin_id"):
            with self.subTest(origin_field=origin_field):
                task = SimpleNamespace(ga_note_origin_id=None, plan_note_origin_id=None)
                setattr(task, origin_field, "source-note-id")
                self.assertFalse(_requires_rlz_completion_comment(task))

    def test_regular_tasks_still_require_an_rlz_comment_to_complete(self) -> None:
        task = SimpleNamespace(ga_note_origin_id=None, plan_note_origin_id=None)
        self.assertTrue(_requires_rlz_completion_comment(task))

    def test_special_tasks_skip_the_result_comment_and_support_waiting_confirmation(self) -> None:
        for task_type in ("is_1h_report", "is_r1", "is_personal", "is_bllok"):
            with self.subTest(task_type=task_type):
                task = SimpleNamespace(
                    system_template_origin_id=None,
                    ga_note_origin_id=None,
                    plan_note_origin_id=None,
                    is_1h_report=False,
                    is_r1=False,
                    is_personal=False,
                    is_bllok=False,
                )
                setattr(task, task_type, True)
                self.assertTrue(_supports_waiting_confirmation(task))
                self.assertFalse(_requires_rlz_completion_comment(task))

    def test_system_tasks_do_not_support_waiting_confirmation(self) -> None:
        task = SimpleNamespace(
            system_template_origin_id="system-template-id",
            ga_note_origin_id=None,
            plan_note_origin_id=None,
            is_1h_report=True,
            is_r1=False,
            is_personal=False,
            is_bllok=False,
        )
        self.assertFalse(_supports_waiting_confirmation(task))

    def test_note_tasks_keep_waiting_confirmation_status(self) -> None:
        self.assertEqual(
            _normalize_ga_note_task_status(TaskStatus.WAITING_CONFIRMATION),
            TaskStatus.WAITING_CONFIRMATION,
        )

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
