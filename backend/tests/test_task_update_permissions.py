import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

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

    async def test_any_authenticated_staff_user_can_update_a_one_h_marker(self) -> None:
        from app.api.routers import tasks as tasks_router

        task_id = uuid.uuid4()
        task = SimpleNamespace(
            id=task_id,
            is_1h_report=True,
            one_h_marker=None,
            fast_task_group_id=uuid.uuid4(),
        )
        select_result = MagicMock()
        select_result.scalar_one_or_none.return_value = task
        db = AsyncMock()
        db.execute.side_effect = [select_result, MagicMock()]
        user = SimpleNamespace(role=UserRole.STAFF, id=uuid.uuid4())
        expected = SimpleNamespace(one_h_marker="FLAG")

        with (
            patch.object(tasks_router, "_assignees_for_tasks", new=AsyncMock(return_value={task_id: []})),
            patch.object(tasks_router, "_task_to_out", return_value=expected),
        ):
            result = await tasks_router.update_task_one_h_marker(
                task_id,
                tasks_router.TaskOneHMarkerUpdate(one_h_marker="FLAG"),
                db,
                user,
            )

        self.assertEqual(task.one_h_marker, "FLAG")
        self.assertEqual(result.one_h_marker, "FLAG")
        self.assertEqual(db.execute.await_count, 2)
        db.commit.assert_awaited_once()

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
