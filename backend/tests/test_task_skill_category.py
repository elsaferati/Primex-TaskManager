from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace

from pydantic import ValidationError

from app.api.routers.tasks import list_tasks
from app.models.enums import TaskSkillCategory
from app.schemas.task import TaskCreate, TaskUpdate


class _EmptyScalars:
    def all(self):
        return []


class _EmptyResult:
    def scalars(self):
        return _EmptyScalars()


class _FakeAsyncSession:
    def __init__(self) -> None:
        self.executed = []

    async def execute(self, statement):
        self.executed.append(statement)
        return _EmptyResult()


class TestTaskSkillCategorySchemas(unittest.TestCase):
    def test_create_accepts_each_matrix_category(self) -> None:
        for category in TaskSkillCategory:
            payload = TaskCreate(title="Valid task", skill_category=category.value)
            self.assertEqual(payload.skill_category, category)

    def test_update_can_clear_category(self) -> None:
        payload = TaskUpdate(skill_category=None)
        self.assertIn("skill_category", payload.model_fields_set)
        self.assertIsNone(payload.skill_category)

    def test_unknown_category_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            TaskCreate(title="Valid task", skill_category="classification")


class TestTaskSkillCategoryFilter(unittest.IsolatedAsyncioTestCase):
    async def test_list_filter_targets_skill_category(self) -> None:
        db = _FakeAsyncSession()
        await list_tasks(
            db=db,
            user=SimpleNamespace(id=uuid.uuid4()),
            include_inactive=True,
            include_all_done=True,
            ga_note_origin_ids=None,
            plan_note_origin_ids=None,
            skill_category=TaskSkillCategory.analysis,
        )
        self.assertTrue(db.executed)
        self.assertIn("skill_category", str(db.executed[0].whereclause))


if __name__ == "__main__":
    unittest.main()
