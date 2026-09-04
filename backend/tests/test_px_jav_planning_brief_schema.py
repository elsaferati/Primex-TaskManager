from __future__ import annotations

import unittest
import uuid

from app.schemas.plan_note import PlanNoteUpdate, PxJavPlanningBrief
from app.schemas.task import TaskOut


class PxJavPlanningBriefSchemaTests(unittest.TestCase):
    def test_normalizes_text_and_drops_dg_person_when_dg_is_not_yes(self) -> None:
        brief = PxJavPlanningBrief.model_validate(
            {
                "dl": "  12.09.2026  ",
                "dg": False,
                "dg_kush": "  Person që nuk duhet ruajtur  ",
                "hapat": "  Hapi 1  ",
                "kush": "  AD  ",
                "sq": "   ",
            }
        )

        self.assertEqual(brief.dl, "12.09.2026")
        self.assertIsNone(brief.dg_kush)
        self.assertEqual(brief.hapat, "Hapi 1")
        self.assertEqual(brief.kush, "AD")
        self.assertIsNone(brief.sq)

    def test_keeps_dg_person_only_for_yes(self) -> None:
        user_id = uuid.uuid4()
        brief = PxJavPlanningBrief.model_validate(
            {"dg": True, "dg_kush": "  GA, AD  ", "dg_kush_user_ids": [user_id, user_id]}
        )

        self.assertTrue(brief.dg)
        self.assertEqual(brief.dg_kush, "GA, AD")
        self.assertEqual(brief.dg_kush_user_ids, [user_id])

    def test_drops_dg_users_when_dg_is_not_yes(self) -> None:
        brief = PxJavPlanningBrief.model_validate(
            {"dg": False, "dg_kush_user_ids": [uuid.uuid4()]}
        )

        self.assertEqual(brief.dg_kush_user_ids, [])

    def test_deduplicates_kush_users(self) -> None:
        user_id = uuid.uuid4()
        brief = PxJavPlanningBrief.model_validate({"kush_user_ids": [user_id, user_id]})

        self.assertEqual(brief.kush_user_ids, [user_id])

    def test_update_distinguishes_omitted_brief_from_explicit_removal(self) -> None:
        omitted = PlanNoteUpdate.model_validate({})
        removed = PlanNoteUpdate.model_validate({"planning_brief": None})

        self.assertNotIn("planning_brief", omitted.model_dump(exclude_unset=True))
        self.assertIn("planning_brief", removed.model_dump(exclude_unset=True))
        self.assertIsNone(removed.planning_brief)

    def test_task_output_accepts_px_jav_brief(self) -> None:
        self.assertIn("planning_brief", TaskOut.model_fields)
        annotation = TaskOut.model_fields["planning_brief"].annotation
        self.assertIsNotNone(annotation)

if __name__ == "__main__":
    unittest.main()
