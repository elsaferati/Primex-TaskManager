import unittest
import uuid

from app.api.routers.tasks import _can_complete_waiting_confirmation
from app.models.enums import UserRole


class TestTaskWaitingConfirmationPermissions(unittest.TestCase):
    def test_confirmer_can_complete(self) -> None:
        actor_id = uuid.uuid4()
        allowed = _can_complete_waiting_confirmation(
            user_role=UserRole.STAFF,
            actor_user_id=actor_id,
            confirmation_assignee_id=actor_id,
            actor_is_assignee=False,
        )
        self.assertTrue(allowed)

    def test_non_confirmer_assignee_can_complete(self) -> None:
        allowed = _can_complete_waiting_confirmation(
            user_role=UserRole.STAFF,
            actor_user_id=uuid.uuid4(),
            confirmation_assignee_id=uuid.uuid4(),
            actor_is_assignee=True,
        )
        self.assertTrue(allowed)

    def test_admin_can_complete(self) -> None:
        allowed = _can_complete_waiting_confirmation(
            user_role=UserRole.ADMIN,
            actor_user_id=uuid.uuid4(),
            confirmation_assignee_id=uuid.uuid4(),
            actor_is_assignee=False,
        )
        self.assertTrue(allowed)

    def test_manager_can_complete(self) -> None:
        allowed = _can_complete_waiting_confirmation(
            user_role=UserRole.MANAGER,
            actor_user_id=uuid.uuid4(),
            confirmation_assignee_id=uuid.uuid4(),
            actor_is_assignee=False,
        )
        self.assertTrue(allowed)

    def test_unrelated_staff_cannot_complete(self) -> None:
        allowed = _can_complete_waiting_confirmation(
            user_role=UserRole.STAFF,
            actor_user_id=uuid.uuid4(),
            confirmation_assignee_id=uuid.uuid4(),
            actor_is_assignee=False,
        )
        self.assertFalse(allowed)


if __name__ == "__main__":
    unittest.main()
