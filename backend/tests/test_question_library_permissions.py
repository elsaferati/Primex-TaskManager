import unittest
import uuid

from app.api.routers.question_library import can_manage_question_library, visible_status_owner_id
from app.models.enums import UserRole


class TestQuestionLibraryPermissions(unittest.TestCase):
    def test_admin_and_manager_can_manage_definitions(self) -> None:
        self.assertTrue(can_manage_question_library(UserRole.ADMIN))
        self.assertTrue(can_manage_question_library(UserRole.MANAGER))

    def test_staff_cannot_manage_definitions(self) -> None:
        self.assertFalse(can_manage_question_library(UserRole.STAFF))

    def test_staff_status_scope_is_their_own_user(self) -> None:
        user_id = uuid.uuid4()
        self.assertEqual(visible_status_owner_id(UserRole.STAFF, user_id), user_id)

    def test_admin_and_manager_status_scope_includes_all_users(self) -> None:
        user_id = uuid.uuid4()
        self.assertIsNone(visible_status_owner_id(UserRole.ADMIN, user_id))
        self.assertIsNone(visible_status_owner_id(UserRole.MANAGER, user_id))


if __name__ == "__main__":
    unittest.main()
