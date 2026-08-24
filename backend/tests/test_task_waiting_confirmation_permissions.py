import unittest
import uuid

from app.api.routers.tasks import (
    _can_complete_waiting_confirmation,
    _confirmation_assignee_was_provided,
)
from app.models.enums import UserRole
from app.schemas.task import TaskUpdate


class TestTaskWaitingConfirmationPermissions(unittest.TestCase):
    def test_non_null_confirmer_does_not_depend_on_field_set_metadata(self) -> None:
        confirmer_id = uuid.uuid4()
        payload = TaskUpdate(confirmation_assignee_id=confirmer_id)
        # Reproduce a runtime where Pydantic's explicit-field metadata is
        # incomplete even though the parsed request contains the UUID.
        payload.__pydantic_fields_set__.clear()

        self.assertTrue(_confirmation_assignee_was_provided(payload))

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
