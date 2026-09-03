import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

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

    def test_other_department_staff_can_edit(self) -> None:
        user = SimpleNamespace(role=UserRole.STAFF, department_id=uuid.uuid4(), id=uuid.uuid4())
        task = SimpleNamespace(
            created_by=uuid.uuid4(),
            assigned_to=uuid.uuid4(),
            department_id=uuid.uuid4(),
            ga_note_origin_id=None,
            plan_note_origin_id=None,
            assignees=[],
        )
        ensure_task_editor(user, task)  # type: ignore[arg-type]

    async def test_control_ko_sync_uses_authoritative_ko_owner(self) -> None:
        from app.api.routers import tasks as tasks_router

        ko_user_id = uuid.uuid4()
        task = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            assigned_to=uuid.uuid4(),
            phase="CONTROL",
            internal_notes=f"ko_user_id={ko_user_id}",
        )

        async def sync_owner(_db, *, task, project):
            task.assigned_to = ko_user_id
            return ko_user_id

        with patch.object(
            tasks_router,
            "ensure_ko_user_is_task_assignee",
            new=AsyncMock(side_effect=sync_owner),
        ) as ensure_ko:
            result = await tasks_router._sync_control_task_owner_from_ko(
                AsyncMock(),
                task=task,  # type: ignore[arg-type]
                project=SimpleNamespace(),
            )
            ensure_ko.assert_awaited_once()
            self.assertEqual(result, ko_user_id)
            self.assertEqual(task.assigned_to, ko_user_id)


if __name__ == "__main__":
    unittest.main()
