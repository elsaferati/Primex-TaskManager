import uuid
import unittest

from app.schemas.plan_note import PlanNoteTaskBundleUpdate


class PlanNoteTaskBundleSchemaTests(unittest.TestCase):
    def test_project_can_be_set_or_cleared(self) -> None:
        project_id = uuid.uuid4()

        self.assertEqual(
            PlanNoteTaskBundleUpdate.model_validate({"project_id": str(project_id)}).project_id,
            project_id,
        )
        self.assertIsNone(PlanNoteTaskBundleUpdate.model_validate({"project_id": None}).project_id)

    def test_assignee_state_keeps_confirmation_assignee(self) -> None:
        assignee_id = uuid.uuid4()
        confirmer_id = uuid.uuid4()

        payload = PlanNoteTaskBundleUpdate.model_validate(
            {
                "assignee_states": [
                    {
                        "assignee_id": str(assignee_id),
                        "status": "WAITING_CONFIRMATION",
                        "confirmation_assignee_id": str(confirmer_id),
                    }
                ]
            }
        )

        self.assertEqual(payload.assignee_states[0].confirmation_assignee_id, confirmer_id)


if __name__ == "__main__":
    unittest.main()
