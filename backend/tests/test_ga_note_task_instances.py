from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from sqlalchemy.sql import Select

from app.models.enums import ProjectPhaseStatus, TaskFinishPeriod, TaskPriority, TaskStatus
from app.models.task import Task
from app.services.ga_note_task_instances import (
    GaNoteAssigneeExecutionState,
    apply_ga_note_assignee_execution_states,
    apply_ga_note_shared_task_fields,
    reconcile_ga_note_task_assignees,
)


class _ScalarResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return self

    def all(self):
        return list(self._values)


class _FakeSession:
    def __init__(self, select_batches):
        self._select_batches = list(select_batches)
        self.added: list[Task] = []

    async def execute(self, statement, *_args, **_kwargs):
        if isinstance(statement, Select):
            return _ScalarResult(self._select_batches.pop(0))
        return _ScalarResult([])

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        for task in self.added:
            if task.id is None:
                task.id = uuid.uuid4()


def _task(note_id: uuid.UUID, owner_id: uuid.UUID, status: TaskStatus) -> Task:
    return Task(
        id=uuid.uuid4(),
        title="Shared GA task",
        description="Shared description",
        project_id=None,
        department_id=uuid.uuid4(),
        assigned_to=owner_id,
        created_by=uuid.uuid4(),
        ga_note_origin_id=note_id,
        fast_task_group_id=None,
        status=status,
        priority=TaskPriority.NORMAL,
        phase=ProjectPhaseStatus.MEETINGS,
        progress_percentage=0,
        is_deadline_important=False,
        is_bllok=False,
        is_1h_report=False,
        is_r1=False,
        is_personal=False,
        is_active=True,
    )


class TestGaNoteTaskInstances(unittest.IsolatedAsyncioTestCase):
    async def test_reconcile_preserves_existing_statuses_and_creates_one_todo_copy(self) -> None:
        note_id = uuid.uuid4()
        owner_a, owner_b, owner_c, owner_d = (uuid.uuid4() for _ in range(4))
        task_a = _task(note_id, owner_a, TaskStatus.TODO)
        task_b = _task(note_id, owner_b, TaskStatus.IN_PROGRESS)
        task_c = _task(note_id, owner_c, TaskStatus.DONE)
        note = SimpleNamespace(id=note_id, department_id=uuid.uuid4(), is_converted_to_task=True)
        users = [
            SimpleNamespace(id=value, department_id=uuid.uuid4(), is_active=True)
            for value in (owner_a, owner_c, owner_d)
        ]
        session = _FakeSession([[task_a, task_b, task_c], users])

        result = await reconcile_ga_note_task_assignees(
            session,
            note=note,
            desired_assignee_ids=[owner_a, owner_c, owner_d, owner_d],
            actor_user_id=uuid.uuid4(),
        )

        active_by_owner = {task.assigned_to: task for task in result.active_tasks}
        self.assertEqual(set(active_by_owner), {owner_a, owner_c, owner_d})
        self.assertEqual(active_by_owner[owner_a].status, TaskStatus.TODO)
        self.assertEqual(active_by_owner[owner_c].status, TaskStatus.DONE)
        self.assertEqual(active_by_owner[owner_d].status, TaskStatus.TODO)
        self.assertFalse(task_b.is_active)
        self.assertEqual(result.created_count, 1)
        self.assertEqual(result.deactivated_count, 1)
        self.assertTrue(note.is_converted_to_task)

    async def test_repeating_same_membership_is_idempotent(self) -> None:
        note_id = uuid.uuid4()
        owner_a, owner_b = uuid.uuid4(), uuid.uuid4()
        task_a = _task(note_id, owner_a, TaskStatus.TODO)
        task_b = _task(note_id, owner_b, TaskStatus.IN_PROGRESS)
        note = SimpleNamespace(id=note_id, department_id=uuid.uuid4(), is_converted_to_task=True)
        users = [
            SimpleNamespace(id=value, department_id=uuid.uuid4(), is_active=True)
            for value in (owner_a, owner_b)
        ]
        session = _FakeSession([[task_a, task_b], users])

        result = await reconcile_ga_note_task_assignees(
            session,
            note=note,
            desired_assignee_ids=[owner_a, owner_b],
            actor_user_id=uuid.uuid4(),
        )

        self.assertEqual(result.created_count, 0)
        self.assertEqual(result.deactivated_count, 0)
        self.assertEqual([task.id for task in result.active_tasks], [task_a.id, task_b.id])

    async def test_duplicate_active_copy_is_deactivated_without_replacing_owner_copy(self) -> None:
        note_id = uuid.uuid4()
        owner_id = uuid.uuid4()
        canonical = _task(note_id, owner_id, TaskStatus.IN_PROGRESS)
        duplicate = _task(note_id, owner_id, TaskStatus.DONE)
        note = SimpleNamespace(id=note_id, department_id=uuid.uuid4(), is_converted_to_task=True)
        user = SimpleNamespace(id=owner_id, department_id=uuid.uuid4(), is_active=True)
        session = _FakeSession([[canonical, duplicate], [user]])

        result = await reconcile_ga_note_task_assignees(
            session,
            note=note,
            desired_assignee_ids=[owner_id],
            actor_user_id=uuid.uuid4(),
        )

        self.assertEqual(result.active_tasks, [canonical])
        self.assertEqual(canonical.status, TaskStatus.IN_PROGRESS)
        self.assertFalse(duplicate.is_active)
        self.assertEqual(result.deduplicated_count, 1)
        self.assertEqual(result.deactivated_count, 1)

    def test_shared_edits_do_not_change_per_person_execution_state(self) -> None:
        note_id = uuid.uuid4()
        task_a = _task(note_id, uuid.uuid4(), TaskStatus.TODO)
        task_b = _task(note_id, uuid.uuid4(), TaskStatus.IN_PROGRESS)
        task_c = _task(note_id, uuid.uuid4(), TaskStatus.DONE)

        updated = apply_ga_note_shared_task_fields(
            [task_a, task_b, task_c],
            title="Updated title",
            description_is_set=True,
            description="Updated description",
        )

        self.assertEqual(updated, 3)
        self.assertEqual([task.status for task in (task_a, task_b, task_c)], [
            TaskStatus.TODO,
            TaskStatus.IN_PROGRESS,
            TaskStatus.DONE,
        ])
        self.assertTrue(all(task.title == "Updated title" for task in (task_a, task_b, task_c)))

    def test_assignee_execution_updates_only_the_matching_copy(self) -> None:
        note_id = uuid.uuid4()
        owner_a, owner_b = uuid.uuid4(), uuid.uuid4()
        task_a = _task(note_id, owner_a, TaskStatus.TODO)
        task_b = _task(note_id, owner_b, TaskStatus.IN_PROGRESS)
        start = datetime(2026, 7, 22, tzinfo=timezone.utc)
        due = datetime(2026, 7, 24, tzinfo=timezone.utc)

        updated = apply_ga_note_assignee_execution_states(
            [task_a, task_b],
            [
                GaNoteAssigneeExecutionState(
                    assignee_id=owner_a,
                    status=TaskStatus.DONE,
                    start_date=start,
                    due_date=due,
                    finish_period=TaskFinishPeriod.PM,
                    is_deadline_important=True,
                    priority=TaskPriority.HIGH,
                    is_1h_report=True,
                )
            ],
        )

        self.assertEqual(updated, 1)
        self.assertEqual(task_a.status, TaskStatus.DONE.value)
        self.assertEqual(task_a.start_date, start)
        self.assertEqual(task_a.due_date, due)
        self.assertEqual(task_a.finish_period, TaskFinishPeriod.PM.value)
        self.assertTrue(task_a.is_deadline_important)
        self.assertEqual(task_a.priority, TaskPriority.HIGH.value)
        self.assertTrue(task_a.is_1h_report)
        self.assertIsNotNone(task_a.completed_at)
        self.assertEqual(task_b.status, TaskStatus.IN_PROGRESS)
        self.assertIsNone(task_b.due_date)
        self.assertEqual(task_b.priority, TaskPriority.NORMAL)
        self.assertFalse(task_b.is_1h_report)

    def test_assignee_execution_rejects_invalid_date_range(self) -> None:
        note_id = uuid.uuid4()
        owner_id = uuid.uuid4()
        task = _task(note_id, owner_id, TaskStatus.TODO)

        with self.assertRaisesRegex(ValueError, "Start date cannot be after due date"):
            apply_ga_note_assignee_execution_states(
                [task],
                [
                    GaNoteAssigneeExecutionState(
                        assignee_id=owner_id,
                        status=TaskStatus.TODO,
                        start_date=datetime(2026, 7, 25, tzinfo=timezone.utc),
                        due_date=datetime(2026, 7, 24, tzinfo=timezone.utc),
                    )
                ],
            )


if __name__ == "__main__":
    unittest.main()
