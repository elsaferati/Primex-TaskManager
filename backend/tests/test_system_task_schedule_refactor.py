from __future__ import annotations

from datetime import datetime, time, timezone
from types import SimpleNamespace
from unittest import TestCase

from app.models.enums import FrequencyType
from app.services.system_task_instances import _adjust_due_datetime_local
from app.services.system_task_schedule import first_run_at, next_occurrence


class TestSystemTaskScheduleRefactor(TestCase):
    def test_daily_first_run_is_tomorrow_when_after_due_time(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.DAILY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            interval=1,
            created_at=datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc),
        )
        run_at = first_run_at(tmpl, datetime(2026, 3, 3, 10, 0, tzinfo=timezone.utc))
        self.assertEqual(run_at.astimezone(timezone.utc).date().isoformat(), "2026-03-04")

    def test_monthly_overflow_uses_last_working_day_of_month(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.MONTHLY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_month=31,
            interval=1,
            created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
        )
        nxt = next_occurrence(tmpl, datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(nxt.astimezone(timezone.utc).date().isoformat(), "2026-02-27")

    def test_yearly_weekend_shifts_to_friday(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.YEARLY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_month=31,
            month_of_year=5,
            interval=1,
            created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
        )
        nxt = next_occurrence(tmpl, datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(nxt.astimezone(timezone.utc).date().isoformat(), "2026-05-29")

    def test_three_month_schedule_respects_start_month(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.THREE_MONTHS,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_month=31,
            month_of_year=1,
            interval=1,
            created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
        )
        nxt = next_occurrence(tmpl, datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(nxt.astimezone(timezone.utc).date().isoformat(), "2026-04-30")

    def test_duration_and_weekend_policy(self) -> None:
        due = _adjust_due_datetime_local(
            tz=timezone.utc,
            due_time=time(9, 0),
            start_local_dt=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
            duration_days=4,
        )
        self.assertEqual(due.date().isoformat(), "2026-03-06")
