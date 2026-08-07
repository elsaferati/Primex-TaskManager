import unittest
import uuid
from types import SimpleNamespace

from app.api.routers.planners import _is_note_origin_task


class WeeklyPlannerNoteOriginRangeTests(unittest.TestCase):
    def test_ga_note_tasks_are_note_origin(self) -> None:
        task = SimpleNamespace(ga_note_origin_id=uuid.uuid4(), plan_note_origin_id=None)
        self.assertTrue(_is_note_origin_task(task))

    def test_plan_note_tasks_are_note_origin(self) -> None:
        task = SimpleNamespace(ga_note_origin_id=None, plan_note_origin_id=uuid.uuid4())
        self.assertTrue(_is_note_origin_task(task))

    def test_regular_project_tasks_are_not_note_origin(self) -> None:
        task = SimpleNamespace(ga_note_origin_id=None, plan_note_origin_id=None)
        self.assertFalse(_is_note_origin_task(task))


if __name__ == "__main__":
    unittest.main()
