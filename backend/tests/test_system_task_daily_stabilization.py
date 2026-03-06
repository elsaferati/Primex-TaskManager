from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.routers.system_tasks import list_system_tasks
from app.celery_app import celery_app
from app.services.system_task_instances import ensure_due_today_instances_best_effort


class TestSystemTaskMorningSchedule(TestCase):
    def test_daily_morning_schedule_entries_exist(self) -> None:
        schedule = celery_app.conf.beat_schedule

        self.assertIn("reconcile-system-task-slots", schedule)
        self.assertEqual(
            schedule["reconcile-system-task-slots"]["task"],
            "app.celery_tasks.reconcile_system_task_slots_daily",
        )
        self.assertEqual(schedule["reconcile-system-task-slots"]["schedule"].hour, {6})
        self.assertEqual(schedule["reconcile-system-task-slots"]["schedule"].minute, {30})

        self.assertIn("pregenerate-system-tasks-by-7am", schedule)
        self.assertEqual(
            schedule["pregenerate-system-tasks-by-7am"]["task"],
            "app.celery_tasks.pregenerate_system_tasks_today",
        )
        self.assertEqual(schedule["pregenerate-system-tasks-by-7am"]["schedule"].hour, {6})
        self.assertEqual(schedule["pregenerate-system-tasks-by-7am"]["schedule"].minute, {50})

        self.assertIn("generate-system-tasks", schedule)
        self.assertEqual(schedule["generate-system-tasks"]["schedule"].hour, {7})
        self.assertEqual(schedule["generate-system-tasks"]["schedule"].minute, {0})


class TestDueTodayFallbackService(IsolatedAsyncioTestCase):
    async def test_no_due_slot_does_nothing(self) -> None:
        db = AsyncMock()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=execute_result)

        with patch("app.services.system_task_instances.ensure_slots_initialized", new=AsyncMock()) as init_mock, patch(
            "app.services.system_task_instances.ensure_task_instances_in_range",
            new=AsyncMock(return_value=2),
        ) as ensure_range_mock:
            created = await ensure_due_today_instances_best_effort(
                db=db,
                now_utc=datetime(2026, 3, 6, 6, 0, tzinfo=timezone.utc),
            )

        self.assertEqual(created, 0)
        init_mock.assert_not_awaited()
        ensure_range_mock.assert_not_awaited()
        db.commit.assert_not_awaited()

    async def test_due_slot_runs_generation_for_today(self) -> None:
        db = AsyncMock()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = uuid.uuid4()
        db.execute = AsyncMock(return_value=execute_result)

        with patch("app.services.system_task_instances.ensure_slots_initialized", new=AsyncMock()) as init_mock, patch(
            "app.services.system_task_instances.ensure_task_instances_in_range",
            new=AsyncMock(return_value=3),
        ) as ensure_range_mock, patch(
            "app.services.system_task_instances._app_zoneinfo",
            return_value=timezone.utc,
        ):
            created = await ensure_due_today_instances_best_effort(
                db=db,
                now_utc=datetime(2026, 3, 6, 6, 0, tzinfo=timezone.utc),
            )

        self.assertEqual(created, 3)
        init_mock.assert_awaited_once()
        ensure_range_mock.assert_awaited_once_with(
            db=db,
            start=date(2026, 3, 6),
            end=date(2026, 3, 6),
        )
        db.commit.assert_awaited_once()


class TestListSystemTasksFallbackGuard(IsolatedAsyncioTestCase):
    @staticmethod
    def _empty_execute_result() -> MagicMock:
        result = MagicMock()
        scalars = MagicMock()
        scalars.all.return_value = []
        result.scalars.return_value = scalars
        return result

    async def test_list_runs_fallback_when_occurrence_date_missing(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(return_value=self._empty_execute_result())

        with patch(
            "app.api.routers.system_tasks._run_today_generation_fallback",
            new=AsyncMock(return_value=0),
        ) as fallback_mock:
            result = await list_system_tasks(
                occurrence_date=None,
                db=db,
                user=SimpleNamespace(id=uuid.uuid4()),
            )

        self.assertEqual(result, [])
        fallback_mock.assert_awaited_once()

    async def test_list_skips_fallback_for_non_today_occurrence_date(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(return_value=self._empty_execute_result())

        with patch(
            "app.api.routers.system_tasks._run_today_generation_fallback",
            new=AsyncMock(return_value=0),
        ) as fallback_mock, patch(
            "app.api.routers.system_tasks._app_local_today",
            return_value=date(2026, 3, 6),
        ):
            result = await list_system_tasks(
                occurrence_date=date(2026, 3, 5),
                db=db,
                user=SimpleNamespace(id=uuid.uuid4()),
            )

        self.assertEqual(result, [])
        fallback_mock.assert_not_awaited()
