from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, patch

from app.services.system_task_instances import (
    _assignee_on_full_day_leave,
    _build_annual_leave_snapshot,
    _parse_annual_leave_entry,
    generate_system_task_instances,
    remove_open_system_task_instances_for_leave,
)


class TestSystemTaskLeaveShift(TestCase):
    def test_parse_annual_leave_entry_detects_all_users_marker(self) -> None:
        entry = SimpleNamespace(
            description="[ALL_USERS] Date: 2026-05-01 (Full day) Labour Day",
            entry_date=date(2026, 5, 1),
            created_at=datetime(2026, 4, 30, 8, 0, tzinfo=timezone.utc),
        )

        start_date, end_date, full_day, _, _, note, is_all_users = _parse_annual_leave_entry(entry)

        self.assertEqual(start_date, date(2026, 5, 1))
        self.assertEqual(end_date, date(2026, 5, 1))
        self.assertTrue(full_day)
        self.assertTrue(is_all_users)
        self.assertEqual(note, "Labour Day")

    def test_all_users_leave_blocks_date(self) -> None:
        user_id = uuid.uuid4()
        snapshot = _build_annual_leave_snapshot(
            [
                SimpleNamespace(
                    description="[ALL_USERS] Date: 2026-05-01 (Full day)",
                    entry_date=date(2026, 5, 1),
                    created_at=datetime(2026, 4, 30, 8, 0, tzinfo=timezone.utc),
                    assigned_to_user_id=None,
                    created_by_user_id=user_id,
                )
            ]
        )

        leave_by_user, all_users_ranges = snapshot
        self.assertTrue(
            _assignee_on_full_day_leave(user_id, date(2026, 5, 1), leave_by_user, all_users_ranges)
        )

    def test_only_individual_assignee_on_leave_is_blocked(self) -> None:
        first_user_id = uuid.uuid4()
        second_user_id = uuid.uuid4()
        working_user_id = uuid.uuid4()
        leave_by_user, all_users_ranges = _build_annual_leave_snapshot(
            [
                SimpleNamespace(
                    description="Date: 2026-05-01 (Full day)",
                    entry_date=date(2026, 5, 1),
                    created_at=datetime(2026, 4, 30, 8, 0, tzinfo=timezone.utc),
                    assigned_to_user_id=first_user_id,
                    created_by_user_id=first_user_id,
                ),
                SimpleNamespace(
                    description="Date: 2026-05-01 (Full day)",
                    entry_date=date(2026, 5, 1),
                    created_at=datetime(2026, 4, 30, 8, 0, tzinfo=timezone.utc),
                    assigned_to_user_id=second_user_id,
                    created_by_user_id=second_user_id,
                ),
            ]
        )

        self.assertTrue(
            _assignee_on_full_day_leave(
                first_user_id,
                date(2026, 5, 1),
                leave_by_user,
                all_users_ranges,
            )
        )
        self.assertTrue(
            _assignee_on_full_day_leave(
                second_user_id,
                date(2026, 5, 1),
                leave_by_user,
                all_users_ranges,
            )
        )
        self.assertFalse(
            _assignee_on_full_day_leave(
                working_user_id,
                date(2026, 5, 1),
                leave_by_user,
                all_users_ranges,
            )
        )

    def test_partial_day_leave_does_not_block_assignee(self) -> None:
        user_id = uuid.uuid4()
        leave_by_user, all_users_ranges = _build_annual_leave_snapshot(
            [
                SimpleNamespace(
                    description="Date: 2026-05-01 (08:00 - 12:00)",
                    entry_date=date(2026, 5, 1),
                    created_at=datetime(2026, 4, 30, 8, 0, tzinfo=timezone.utc),
                    assigned_to_user_id=user_id,
                    created_by_user_id=user_id,
                )
            ]
        )

        self.assertFalse(
            _assignee_on_full_day_leave(user_id, date(2026, 5, 1), leave_by_user, all_users_ranges)
        )


class TestSystemTaskLeaveGeneration(IsolatedAsyncioTestCase):
    async def test_generator_skips_only_full_day_leave_assignee(self) -> None:
        leave_user_id = uuid.uuid4()
        working_user_id = uuid.uuid4()
        occurrence = datetime(2026, 5, 1, 9, 0, tzinfo=timezone.utc)
        template = SimpleNamespace(id=uuid.uuid4(), duration_days=1, department_id=None)
        leave_slot = SimpleNamespace(
            id=uuid.uuid4(),
            primary_user_id=leave_user_id,
            next_run_at=occurrence,
        )
        working_slot = SimpleNamespace(
            id=uuid.uuid4(),
            primary_user_id=working_user_id,
            next_run_at=occurrence,
        )
        leave_entry = SimpleNamespace(
            description="Date: 2026-05-01 (Full day)",
            entry_date=date(2026, 5, 1),
            created_at=datetime(2026, 4, 30, 8, 0, tzinfo=timezone.utc),
            assigned_to_user_id=leave_user_id,
            created_by_user_id=leave_user_id,
        )
        slots_result = SimpleNamespace(all=lambda: [(leave_slot, template), (working_slot, template)])
        leave_result = SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [leave_entry]))
        db = SimpleNamespace(execute=AsyncMock(side_effect=[slots_result, leave_result]))

        with (
            patch("app.services.system_task_instances.ensure_slots_initialized", new=AsyncMock()),
            patch(
                "app.services.system_task_instances._assignee_department_map",
                new=AsyncMock(return_value={leave_user_id: None, working_user_id: None}),
            ),
            patch("app.services.system_task_instances.template_tz", return_value=timezone.utc),
            patch("app.services.system_task_instances.template_due_time", return_value=occurrence.time()),
            patch(
                "app.services.system_task_instances.next_occurrence",
                side_effect=lambda _template, current: current.replace(day=current.day + 7),
            ),
            patch(
                "app.services.system_task_instances._insert_system_task_instance",
                new=AsyncMock(return_value=True),
            ) as insert_instance,
        ):
            created = await generate_system_task_instances(
                db=db,
                now_utc=occurrence,
                start=occurrence.date(),
                end=occurrence.date(),
            )

        self.assertEqual(created, 1)
        insert_instance.assert_awaited_once()
        self.assertIs(insert_instance.await_args.kwargs["slot"], working_slot)

    async def test_partial_day_leave_does_not_remove_pre_generated_tasks(self) -> None:
        user_id = uuid.uuid4()
        entry = SimpleNamespace(
            description="Date: 2026-05-01 (08:00 - 12:00)",
            entry_date=date(2026, 5, 1),
            created_at=datetime(2026, 4, 30, 8, 0, tzinfo=timezone.utc),
            assigned_to_user_id=user_id,
            created_by_user_id=user_id,
        )
        db = SimpleNamespace(execute=AsyncMock())

        removed = await remove_open_system_task_instances_for_leave(db, entry)

        self.assertEqual(removed, 0)
        db.execute.assert_not_awaited()

    async def test_full_day_leave_removes_open_pre_generated_tasks(self) -> None:
        user_id = uuid.uuid4()
        task_id = uuid.uuid4()
        entry = SimpleNamespace(
            description="Date: 2026-05-01 (Full day)",
            entry_date=date(2026, 5, 1),
            created_at=datetime(2026, 4, 30, 8, 0, tzinfo=timezone.utc),
            assigned_to_user_id=user_id,
            created_by_user_id=user_id,
        )
        task_ids_result = SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [task_id]))
        delete_result = SimpleNamespace(rowcount=1)
        db = SimpleNamespace(execute=AsyncMock(side_effect=[task_ids_result, delete_result]))

        removed = await remove_open_system_task_instances_for_leave(db, entry)

        self.assertEqual(removed, 1)
        self.assertEqual(db.execute.await_count, 2)
