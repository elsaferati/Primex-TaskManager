from __future__ import annotations

from datetime import datetime, timezone
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, patch

from app.celery_app import celery_app
from app.config import settings
from app.services.system_task_instances import ensure_due_today_instances_best_effort
from app.services.system_task_scheduler import next_scheduler_run_after


class TestSystemTaskMorningSchedule(TestCase):
    def test_daily_scheduler_entry_exists_at_6am(self) -> None:
        schedule = celery_app.conf.beat_schedule

        self.assertIn("generate-system-tasks-daily", schedule)
        self.assertEqual(
            schedule["generate-system-tasks-daily"]["task"],
            "app.celery_tasks.generate_system_tasks",
        )
        self.assertEqual(schedule["generate-system-tasks-daily"]["schedule"].day_of_week, {5})
        self.assertEqual(schedule["generate-system-tasks-daily"]["schedule"].hour, {6})
        self.assertEqual(schedule["generate-system-tasks-daily"]["schedule"].minute, {0})

    def test_scheduler_lookahead_defaults_to_seven_days(self) -> None:
        self.assertEqual(settings.SYSTEM_TASK_GENERATE_AHEAD_DAYS, 7)

    def test_next_scheduler_run_stays_same_friday_before_6am(self) -> None:
        next_run = next_scheduler_run_after(datetime(2026, 3, 6, 4, 0, tzinfo=timezone.utc))
        self.assertEqual(next_run.astimezone(timezone.utc).isoformat(), "2026-03-06T05:00:00+00:00")

    def test_next_scheduler_run_rolls_to_next_friday_after_6am(self) -> None:
        next_run = next_scheduler_run_after(datetime(2026, 3, 6, 6, 0, tzinfo=timezone.utc))
        self.assertEqual(next_run.astimezone(timezone.utc).isoformat(), "2026-03-13T05:00:00+00:00")


class TestDueTodayFallbackService(IsolatedAsyncioTestCase):
    async def test_best_effort_generation_commits_once(self) -> None:
        db = AsyncMock()

        with patch(
            "app.services.system_task_instances.generate_system_task_instances",
            new=AsyncMock(return_value=3),
        ) as generate_mock:
            created = await ensure_due_today_instances_best_effort(
                db=db,
                now_utc=datetime(2026, 3, 6, 6, 0, tzinfo=timezone.utc),
            )

        self.assertEqual(created, 3)
        generate_mock.assert_awaited_once_with(
            db=db,
            now_utc=datetime(2026, 3, 6, 6, 0, tzinfo=timezone.utc),
        )
        db.commit.assert_awaited_once()
