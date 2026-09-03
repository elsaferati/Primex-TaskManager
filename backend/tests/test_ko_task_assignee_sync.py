import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.ko_task_assignee_sync import ensure_ko_user_is_task_assignee


class TestKoTaskAssigneeSync(unittest.IsolatedAsyncioTestCase):
    async def test_non_control_task_keeps_existing_owner_and_assignees(self) -> None:
        original_owner = uuid.uuid4()
        task = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            phase="PRODUCT",
            assigned_to=original_owner,
            internal_notes=None,
        )
        project = SimpleNamespace(id=task.project_id, department_id=uuid.uuid4())
        department_result = MagicMock()
        department_result.scalar_one_or_none.return_value = "PCM"
        db = AsyncMock()
        db.execute.return_value = department_result

        with patch(
            "app.services.ko_task_assignee_sync.ko_rule_applies_for_task",
            return_value=False,
        ):
            result = await ensure_ko_user_is_task_assignee(db, task=task, project=project)

        self.assertIsNone(result)
        self.assertEqual(task.assigned_to, original_owner)
        self.assertEqual(db.execute.await_count, 1)

    async def test_pcm_control_replaces_all_assignees_with_ko(self) -> None:
        ko_user_id = uuid.uuid4()
        task = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            phase="CONTROL",
            assigned_to=uuid.uuid4(),
            internal_notes=f"ko_user_id={ko_user_id}",
        )
        project = SimpleNamespace(id=task.project_id, department_id=uuid.uuid4())
        department_result = MagicMock()
        department_result.scalar_one_or_none.return_value = "PCM"
        db = AsyncMock()
        db.execute.side_effect = [department_result, MagicMock(), MagicMock()]

        with (
            patch("app.services.ko_task_assignee_sync.ko_rule_applies_for_task", return_value=True),
            patch("app.services.ko_task_assignee_sync.ko_owner_user_id_for_task", return_value=ko_user_id),
        ):
            result = await ensure_ko_user_is_task_assignee(db, task=task, project=project)

        self.assertEqual(result, ko_user_id)
        self.assertEqual(task.assigned_to, ko_user_id)
        self.assertEqual(db.execute.await_count, 3)

    async def test_pcm_control_without_ko_becomes_unassigned(self) -> None:
        task = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            phase="CONTROL",
            assigned_to=uuid.uuid4(),
            internal_notes=None,
        )
        project = SimpleNamespace(id=task.project_id, department_id=uuid.uuid4())
        department_result = MagicMock()
        department_result.scalar_one_or_none.return_value = "PCM"
        db = AsyncMock()
        db.execute.side_effect = [department_result, MagicMock()]

        with (
            patch("app.services.ko_task_assignee_sync.ko_rule_applies_for_task", return_value=True),
            patch("app.services.ko_task_assignee_sync.ko_owner_user_id_for_task", return_value=None),
        ):
            result = await ensure_ko_user_is_task_assignee(db, task=task, project=project)

        self.assertIsNone(result)
        self.assertIsNone(task.assigned_to)
        self.assertEqual(db.execute.await_count, 2)


if __name__ == "__main__":
    unittest.main()
