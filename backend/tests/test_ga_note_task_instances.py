from __future__ import annotations

import unittest
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy.sql import Select

from app.api.routers.tasks import _GA_NOTE_SHARED_TASK_FIELDS
from app.api.routers.tasks import GaNoteTaskBatchRequest, list_task_summaries_by_ga_notes
from app.models.enums import ProjectPhaseStatus, TaskFinishPeriod, TaskPriority, TaskStatus
from app.models.task import Task
from app.models.task_one_h_report_slot import TaskOneHReportSlot
from app.services.ga_note_task_instances import (
    GaNoteAssigneeExecutionState,
    apply_ga_note_assignee_execution_states,
    apply_ga_note_shared_task_fields,
    reconcile_ga_note_task_assignees,
    reconcile_plan_note_task_assignees,
    sync_ga_note_assignee_report_slots,
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
        self.added: list[Task | TaskOneHReportSlot] = []
        self.deleted = []
        self.statements = []

    async def execute(self, statement, *_args, **_kwargs):
        self.statements.append(statement)
        if isinstance(statement, Select):
            return _ScalarResult(self._select_batches.pop(0))
        return _ScalarResult([])

    def add(self, value):
        self.added.append(value)

    async def delete(self, value):
        self.deleted.append(value)

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
    async def test_note_editor_reload_returns_saved_slots_and_active_symbols(self) -> None:
        day = date(2026, 9, 16)
        for source in ("ga_note_origin_id", "plan_note_origin_id"):
            with self.subTest(source=source):
                note_id = uuid.uuid4()
                owner_a, owner_b = uuid.uuid4(), uuid.uuid4()
                task_a = _task(note_id, owner_a, TaskStatus.TODO)
                task_b = _task(note_id, owner_b, TaskStatus.IN_PROGRESS)
                if source == "plan_note_origin_id":
                    for task in (task_a, task_b):
                        task.ga_note_origin_id = None
                        task.plan_note_origin_id = note_id
                for task in (task_a, task_b):
                    task.created_at = task.updated_at = datetime(2026, 9, 16, tzinfo=timezone.utc)
                    task.one_h_marker = "FLAG"
                    task.one_h_marker_date = day
                task_b.one_h_report_slot = "14:20"
                task_b.one_h_marker_date = date(2026, 9, 15)
                apply_ga_note_assignee_execution_states(
                    [task_a, task_b],
                    [GaNoteAssigneeExecutionState(
                        assignee_id=owner_a,
                        status=TaskStatus.TODO,
                        one_h_report_slot="11:50",
                        one_h_report_slot_is_set=True,
                        is_1h_report=True,
                    )],
                )
                session = _FakeSession([[task_a, task_b]])
                payload_fields = {"ga_note_origin_ids": []}
                payload_fields[source.replace("_id", "_ids")] = [note_id]
                payload = GaNoteTaskBatchRequest(**payload_fields)
                with patch("app.api.routers.tasks._assignees_for_tasks", new=AsyncMock(return_value={})), \
                     patch("app.services.task_marker.current_effective_marker_date", return_value=day):
                    summaries = await list_task_summaries_by_ga_notes(payload, db=session, _=None)

                by_owner = {item.assigned_to: item.model_dump() for item in summaries}
                self.assertEqual(by_owner[owner_a]["one_h_report_slot"], "11:50")
                self.assertEqual(by_owner[owner_b]["one_h_report_slot"], "14:20")
                self.assertEqual(by_owner[owner_a]["one_h_marker"], "FLAG")
                self.assertIsNone(by_owner[owner_b]["one_h_marker"])
                # These columns must be eagerly loaded to avoid async lazy-load errors.
                selected_columns = str(session.statements[0]).split("FROM")[0]
                for column in ("one_h_report_slot", "one_h_marker", "one_h_marker_date"):
                    self.assertIn(f"tasks.{column}", selected_columns)

    async def test_note_editor_syncs_only_explicit_slots_for_effective_report_day(self) -> None:
        owners = [uuid.uuid4() for _ in range(4)]
        tasks = [_task(uuid.uuid4(), owner, TaskStatus.TODO) for owner in owners]
        tasks[0].one_h_report_slot = "11:50"
        tasks[1].one_h_report_slot = "16:00"
        tasks[2].one_h_report_slot = None
        tasks[3].one_h_report_slot = "10:00"
        day = date(2026, 9, 17)
        existing = TaskOneHReportSlot(task_id=tasks[1].id, report_date=day, one_h_report_slot="14:20")
        cleared = TaskOneHReportSlot(task_id=tasks[2].id, report_date=day, one_h_report_slot="11:00")
        session = _FakeSession([[existing, cleared]])
        with patch("app.services.ga_note_task_instances.current_effective_slot_date", return_value=day):
            await sync_ga_note_assignee_report_slots(session, tasks, owners[:3])

        self.assertEqual(len(session.added), 1)
        self.assertEqual(session.added[0].task_id, tasks[0].id)
        self.assertEqual(session.added[0].report_date, day)
        self.assertEqual(session.added[0].one_h_report_slot, "11:50")
        self.assertEqual(existing.one_h_report_slot, "16:00")
        self.assertEqual(session.deleted, [cleared])
        params = session.statements[0].compile().params
        self.assertIn(day, params.values())
        self.assertIn([task.id for task in tasks[:3]], params.values())

    async def test_note_editor_omitted_slots_do_not_modify_report_history(self) -> None:
        task = _task(uuid.uuid4(), uuid.uuid4(), TaskStatus.TODO)
        task.one_h_report_slot = "14:20"
        session = _FakeSession([])
        await sync_ga_note_assignee_report_slots(session, [task], [])
        self.assertEqual(session.statements, [])
        self.assertEqual(session.added, [])
        self.assertEqual(session.deleted, [])

    def test_finance_execution_fields_are_editable_on_ga_task_copy(self) -> None:
        self.assertNotIn("description", _GA_NOTE_SHARED_TASK_FIELDS)
        self.assertNotIn("one_h_report_slot", _GA_NOTE_SHARED_TASK_FIELDS)
        self.assertIn("title", _GA_NOTE_SHARED_TASK_FIELDS)

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

    async def test_plan_note_reconcile_creates_independent_px_jav_copy(self) -> None:
        note_id = uuid.uuid4()
        owner_a, owner_b = uuid.uuid4(), uuid.uuid4()
        template = _task(note_id, owner_a, TaskStatus.IN_PROGRESS)
        template.ga_note_origin_id = None
        template.plan_note_origin_id = note_id
        note = SimpleNamespace(id=note_id, department_id=uuid.uuid4(), is_converted_to_task=True)
        users = [
            SimpleNamespace(id=value, department_id=uuid.uuid4(), is_active=True)
            for value in (owner_a, owner_b)
        ]
        session = _FakeSession([[template], users])

        result = await reconcile_plan_note_task_assignees(
            session,
            note=note,
            desired_assignee_ids=[owner_a, owner_b],
            actor_user_id=uuid.uuid4(),
        )

        copy = next(task for task in result.active_tasks if task.assigned_to == owner_b)
        self.assertEqual(result.created_count, 1)
        self.assertEqual(copy.status, TaskStatus.TODO)
        self.assertEqual(copy.plan_note_origin_id, note_id)
        self.assertIsNone(copy.ga_note_origin_id)

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
                    one_h_report_slot="11:50",
                    one_h_report_slot_is_set=True,
                    one_h_marker="QUESTION",
                    one_h_marker_is_set=True,
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
        self.assertEqual(task_a.one_h_report_slot, "11:50")
        self.assertEqual(task_a.one_h_marker, "QUESTION")
        self.assertTrue(task_a.is_deadline_important)
        self.assertEqual(task_a.priority, TaskPriority.HIGH.value)
        self.assertTrue(task_a.is_1h_report)
        self.assertIsNotNone(task_a.completed_at)
        self.assertEqual(task_b.status, TaskStatus.IN_PROGRESS)
        self.assertIsNone(task_b.due_date)
        self.assertEqual(task_b.priority, TaskPriority.NORMAL)
        self.assertFalse(task_b.is_1h_report)

    def test_omitted_one_h_slot_preserves_existing_value(self) -> None:
        note_id = uuid.uuid4()
        owner_id = uuid.uuid4()
        task = _task(note_id, owner_id, TaskStatus.TODO)
        task.is_1h_report = True
        task.one_h_report_slot = "14:20"
        task.one_h_marker = "FLAG"

        updated = apply_ga_note_assignee_execution_states(
            [task],
            [
                GaNoteAssigneeExecutionState(
                    assignee_id=owner_id,
                    status=TaskStatus.IN_PROGRESS,
                    is_1h_report=True,
                )
            ],
        )

        self.assertEqual(updated, 1)
        self.assertEqual(task.one_h_report_slot, "14:20")
        self.assertEqual(task.one_h_marker, "FLAG")

    def test_assignee_execution_accepts_waiting_confirmation(self) -> None:
        note_id = uuid.uuid4()
        owner_id = uuid.uuid4()
        task = _task(note_id, owner_id, TaskStatus.IN_PROGRESS)

        updated = apply_ga_note_assignee_execution_states(
            [task],
            [
                GaNoteAssigneeExecutionState(
                    assignee_id=owner_id,
                    status=TaskStatus.WAITING_CONFIRMATION,
                )
            ],
        )

        self.assertEqual(updated, 1)
        self.assertEqual(task.status, TaskStatus.WAITING_CONFIRMATION.value)
        self.assertIsNone(task.completed_at)

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
