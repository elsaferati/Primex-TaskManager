from __future__ import annotations

import uuid
from datetime import datetime, time, timezone
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, patch

from app.models.enums import FrequencyType
from app.services.system_task_instances import _adjust_due_datetime_local, resolve_assignee
from app.services.system_task_schedule import first_run_at, next_occurrence


class TestSystemTaskScheduleRefactor(TestCase):
    def test_daily_first_run_is_tomorrow_when_after_due_time(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.DAILY,
            timezone="Europe/Tirane",
            due_time=time(9, 0),
            interval=1,
            created_at=datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc),
        )
        # 11:00 Tirane local (UTC+1) is after 09:00 due time.
        run_at = first_run_at(tmpl, datetime(2026, 3, 3, 10, 0, tzinfo=timezone.utc))
        self.assertEqual(run_at.astimezone(timezone.utc).date().isoformat(), "2026-03-04")

    def test_monthly_fallback_to_last_day(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.MONTHLY,
            timezone="Europe/Tirane",
            due_time=time(9, 0),
            day_of_month=31,
            interval=1,
            created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
        )
        nxt = next_occurrence(tmpl, datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(nxt.astimezone(timezone.utc).date().isoformat(), "2026-02-28")

    def test_interval_weekly_every_two_weeks(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.WEEKLY,
            timezone="Europe/Tirane",
            due_time=time(9, 0),
            day_of_week=0,
            days_of_week=[0],
            interval=2,
            created_at=datetime(2026, 3, 2, 8, 0, tzinfo=timezone.utc),  # Monday anchor week
        )
        nxt = next_occurrence(tmpl, datetime(2026, 3, 2, 9, 0, tzinfo=timezone.utc))
        self.assertEqual(nxt.astimezone(timezone.utc).date().isoformat(), "2026-03-16")

    def test_duration_and_weekend_policy(self) -> None:
        due = _adjust_due_datetime_local(
            tz=timezone.utc,
            due_time=time(9, 0),
            start_local_dt=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),  # Thursday
            duration_days=4,  # Sunday -> should move to Friday
        )
        self.assertEqual(due.date().isoformat(), "2026-03-06")


class TestResolveAssignee(IsolatedAsyncioTestCase):
    async def test_primary_absent_falls_to_zv1_then_zv2(self) -> None:
        primary = uuid.uuid4()
        zv1 = uuid.uuid4()
        zv2 = uuid.uuid4()
        db = AsyncMock()

        async def side_effect(_, user_id, __, ___):
            return user_id in {primary, zv1}

        with patch("app.services.system_task_instances._is_user_absent", side_effect=side_effect):
            chosen = await resolve_assignee(
                db,
                primary=primary,
                zv1=zv1,
                zv2=zv2,
                task_start_date=datetime(2026, 3, 3, tzinfo=timezone.utc).date(),
                task_due_date=datetime(2026, 3, 4, tzinfo=timezone.utc).date(),
            )
        self.assertEqual(chosen, zv2)
