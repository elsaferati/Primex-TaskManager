import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.api.access import ensure_task_editor
from app.models.enums import UserRole


class TestTaskUpdatePermissions(unittest.IsolatedAsyncioTestCase):
    def test_department_staff_can_edit_department_task(self) -> None:
        dept_id = uuid.uuid4()
        user = SimpleNamespace(role=UserRole.STAFF, department_id=dept_id, id=uuid.uuid4())
        task = SimpleNamespace(
            created_by=uuid.uuid4(),
            assigned_to=uuid.uuid4(),
            department_id=dept_id,
            ga_note_origin_id=None,
            plan_note_origin_id=None,
            assignees=[],
        )
        ensure_task_editor(user, task)  # type: ignore[arg-type]

    def test_other_department_staff_cannot_edit(self) -> None:
        user = SimpleNamespace(role=UserRole.STAFF, department_id=uuid.uuid4(), id=uuid.uuid4())
        task = SimpleNamespace(
            created_by=uuid.uuid4(),
            assigned_to=uuid.uuid4(),
            department_id=uuid.uuid4(),
            ga_note_origin_id=None,
            plan_note_origin_id=None,
            assignees=[],
        )
        with self.assertRaises(HTTPException) as ctx:
            ensure_task_editor(user, task)  # type: ignore[arg-type]
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_control_ko_sync_does_not_overwrite_assigned_to(self) -> None:
        from app.api.routers import tasks as tasks_router

        task = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            assigned_to=uuid.uuid4(),
            phase="CONTROL",
            internal_notes=f"ko_user_id={uuid.uuid4()}",
        )
        original_assigned = task.assigned_to
        with patch.object(
            tasks_router,
            "ensure_ko_user_is_task_assignee",
            new=AsyncMock(return_value=uuid.uuid4()),
        ) as ensure_ko:
            result = await tasks_router._sync_control_task_owner_from_ko(
                AsyncMock(),
                task=task,  # type: ignore[arg-type]
                project=SimpleNamespace(),
            )
            ensure_ko.assert_awaited_once()
            self.assertIsNotNone(result)
            self.assertEqual(task.assigned_to, original_assigned)


if __name__ == "__main__":
    unittest.main()
