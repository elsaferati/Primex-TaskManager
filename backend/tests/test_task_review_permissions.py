import unittest
import uuid
from datetime import datetime, timezone

from app.api.routers.task_reviews import (
    _is_completed_late,
    can_create_task_reviews,
    can_manage_task_reviews,
    can_view_global_review_overview,
    can_view_review_for_user,
)
from app.models.enums import UserRole
from app.schemas.task_review import TaskReviewCreate
from pydantic import ValidationError


class TestTaskReviewPermissions(unittest.TestCase):
    def test_admin_and_manager_can_manage_reviews(self) -> None:
        self.assertTrue(can_manage_task_reviews(UserRole.ADMIN))
        self.assertTrue(can_manage_task_reviews(UserRole.MANAGER))

    def test_staff_cannot_manage_reviews(self) -> None:
        self.assertFalse(can_manage_task_reviews(UserRole.STAFF))

    def test_staff_can_view_everyones_reviews(self) -> None:
        current = uuid.uuid4()
        self.assertTrue(can_view_review_for_user(UserRole.STAFF, current, current))
        self.assertTrue(can_view_review_for_user(UserRole.STAFF, current, uuid.uuid4()))

    def test_staff_can_create_reviews(self) -> None:
        self.assertTrue(can_create_task_reviews(UserRole.STAFF))

    def test_manager_can_view_another_users_reviews(self) -> None:
        self.assertTrue(
            can_view_review_for_user(UserRole.MANAGER, uuid.uuid4(), uuid.uuid4())
        )

    def test_awarded_diamond_overview_is_global_for_staff(self) -> None:
        self.assertTrue(can_view_global_review_overview(UserRole.STAFF, "reviewed"))

    def test_all_review_overviews_are_global_for_staff(self) -> None:
        self.assertTrue(can_view_global_review_overview(UserRole.STAFF, "all"))
        self.assertTrue(can_view_global_review_overview(UserRole.STAFF, "unreviewed"))

    def test_every_review_has_exactly_one_diamond(self) -> None:
        common = {"task_id": uuid.uuid4(), "reviewee_user_id": uuid.uuid4()}
        self.assertEqual(TaskReviewCreate(**common).diamond_score, 1)
        self.assertEqual(TaskReviewCreate(**common, diamond_score=1).diamond_score, 1)
        with self.assertRaises(ValidationError):
            TaskReviewCreate(**common, diamond_score=0)
        with self.assertRaises(ValidationError):
            TaskReviewCreate(**common, diamond_score=2)

    def test_completion_on_due_date_is_not_late(self) -> None:
        due = datetime(2026, 7, 27, 0, 0, tzinfo=timezone.utc)
        completed = datetime(2026, 7, 27, 18, 0, tzinfo=timezone.utc)
        self.assertFalse(_is_completed_late(completed, due))

    def test_completion_after_due_date_is_late(self) -> None:
        due = datetime(2026, 7, 27, 0, 0, tzinfo=timezone.utc)
        completed = datetime(2026, 7, 28, 18, 0, tzinfo=timezone.utc)
        self.assertTrue(_is_completed_late(completed, due))


if __name__ == "__main__":
    unittest.main()
