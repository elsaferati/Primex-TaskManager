from __future__ import annotations

from datetime import date, datetime, time, timezone
from types import SimpleNamespace
from unittest import TestCase

from app.models.enums import FrequencyType
from app.services.system_task_instances import _adjust_due_datetime_local
from app.services.system_task_schedule import first_run_at, matches_template_date, next_occurrence


class TestSystemTaskScheduleRefactor(TestCase):
    def test_no_recurrence_type_generates_a_weekend_occurrence(self) -> None:
        templates = [
            SimpleNamespace(
                frequency=FrequencyType.DAILY,
                timezone="Europe/Budapest",
                due_time=time(9, 0),
                interval=1,
                created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
            ),
            SimpleNamespace(
                frequency=FrequencyType.WEEKLY,
                timezone="Europe/Budapest",
                due_time=time(9, 0),
                day_of_week=6,
                days_of_week=[5, 6],
                interval=1,
                created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
            ),
            SimpleNamespace(
                frequency=FrequencyType.MONTHLY,
                timezone="Europe/Budapest",
                due_time=time(9, 0),
                day_of_month=1,
                month_of_year=None,
                interval=1,
                created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
            ),
            SimpleNamespace(
                frequency=FrequencyType.THREE_MONTHS,
                timezone="Europe/Budapest",
                due_time=time(9, 0),
                day_of_month=1,
                month_of_year=1,
                interval=1,
                created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
            ),
            SimpleNamespace(
                frequency=FrequencyType.SIX_MONTHS,
                timezone="Europe/Budapest",
                due_time=time(9, 0),
                day_of_month=1,
                month_of_year=1,
                interval=1,
                created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
            ),
            SimpleNamespace(
                frequency=FrequencyType.YEARLY,
                timezone="Europe/Budapest",
                due_time=time(9, 0),
                day_of_month=1,
                month_of_year=1,
                interval=1,
                created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
            ),
        ]

        for template in templates:
            occurrence = first_run_at(
                template,
                datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            )
            for _ in range(20):
                self.assertLess(
                    occurrence.astimezone(timezone.utc).weekday(),
                    5,
                    msg=f"{template.frequency} generated {occurrence.isoformat()}",
                )
                occurrence = next_occurrence(template, occurrence)

    def test_daily_first_run_is_today_when_before_due_time(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.DAILY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            interval=1,
            created_at=datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc),
        )
        run_at = first_run_at(tmpl, datetime(2026, 3, 3, 7, 0, tzinfo=timezone.utc))
        self.assertEqual(run_at.isoformat(), "2026-03-03T08:00:00+00:00")

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

    def test_daily_does_not_match_weekends(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.DAILY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            interval=1,
            created_at=datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc),
        )

        self.assertTrue(matches_template_date(tmpl, date(2026, 3, 6)))
        self.assertFalse(matches_template_date(tmpl, date(2026, 3, 7)))
        self.assertFalse(matches_template_date(tmpl, date(2026, 3, 8)))

    def test_daily_next_occurrence_skips_weekend(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.DAILY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            interval=1,
            created_at=datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc),
        )

        run_at = next_occurrence(tmpl, datetime(2026, 3, 6, 9, 0, tzinfo=timezone.utc))
        self.assertEqual(run_at.astimezone(timezone.utc).date().isoformat(), "2026-03-09")

    def test_daily_approved_on_weekend_starts_monday(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.DAILY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            interval=1,
            created_at=datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc),
        )

        run_at = first_run_at(tmpl, datetime(2026, 3, 7, 8, 0, tzinfo=timezone.utc))
        self.assertEqual(run_at.isoformat(), "2026-03-09T08:00:00+00:00")

    def test_apply_from_prevents_generation_before_future_start_date(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.DAILY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            interval=1,
            apply_from=datetime(2026, 3, 11, 0, 0, tzinfo=timezone.utc),
            created_at=datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc),
        )

        run_at = first_run_at(tmpl, datetime(2026, 3, 3, 7, 0, tzinfo=timezone.utc))
        self.assertEqual(run_at.isoformat(), "2026-03-11T08:00:00+00:00")

    def test_weekly_saturday_and_sunday_run_once_on_friday(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.WEEKLY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_week=5,
            days_of_week=[5, 6],
            interval=1,
            created_at=datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc),
        )

        self.assertTrue(matches_template_date(tmpl, date(2026, 3, 6)))
        self.assertFalse(matches_template_date(tmpl, date(2026, 3, 7)))
        self.assertFalse(matches_template_date(tmpl, date(2026, 3, 8)))
        run_at = first_run_at(tmpl, datetime(2026, 3, 2, 8, 0, tzinfo=timezone.utc))
        self.assertEqual(run_at.isoformat(), "2026-03-06T08:00:00+00:00")

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

    def test_monthly_first_day_sunday_moves_into_previous_month(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.MONTHLY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_month=1,
            interval=1,
            created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
        )

        self.assertTrue(matches_template_date(tmpl, date(2026, 1, 30)))
        self.assertFalse(matches_template_date(tmpl, date(2026, 2, 1)))
        run_at = first_run_at(tmpl, datetime(2026, 1, 2, 8, 0, tzinfo=timezone.utc))
        self.assertEqual(run_at.isoformat(), "2026-01-30T08:00:00+00:00")

    def test_monthly_first_and_last_working_day_markers(self) -> None:
        first = SimpleNamespace(
            frequency=FrequencyType.MONTHLY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_month=-1,
            month_of_year=None,
            interval=1,
            created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
        )
        last = SimpleNamespace(
            frequency=FrequencyType.MONTHLY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_month=0,
            month_of_year=None,
            interval=1,
            created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
        )

        self.assertTrue(matches_template_date(first, date(2026, 8, 3)))
        self.assertFalse(matches_template_date(first, date(2026, 8, 1)))
        self.assertTrue(matches_template_date(last, date(2026, 5, 29)))
        self.assertFalse(matches_template_date(last, date(2026, 5, 31)))

    def test_monthly_interval_uses_nominal_month(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.MONTHLY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_month=1,
            month_of_year=None,
            interval=2,
            apply_from=datetime(2026, 1, 10, 8, 0, tzinfo=timezone.utc),
            created_at=datetime(2026, 1, 10, 8, 0, tzinfo=timezone.utc),
        )

        self.assertFalse(matches_template_date(tmpl, date(2026, 1, 30)))
        self.assertTrue(matches_template_date(tmpl, date(2026, 2, 27)))

    def test_three_month_cycle_uses_nominal_month_after_cross_month_shift(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.THREE_MONTHS,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_month=1,
            month_of_year=2,
            interval=1,
            created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
        )

        self.assertTrue(matches_template_date(tmpl, date(2026, 1, 30)))
        self.assertFalse(matches_template_date(tmpl, date(2026, 2, 27)))
        self.assertTrue(matches_template_date(tmpl, date(2026, 5, 1)))

    def test_six_month_cycle_uses_nominal_month_after_cross_month_shift(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.SIX_MONTHS,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_month=1,
            month_of_year=2,
            interval=1,
            created_at=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),
        )

        self.assertTrue(matches_template_date(tmpl, date(2026, 1, 30)))
        self.assertFalse(matches_template_date(tmpl, date(2026, 5, 1)))
        self.assertTrue(matches_template_date(tmpl, date(2026, 7, 31)))

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

    def test_yearly_january_first_weekend_moves_into_previous_year(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.YEARLY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_month=1,
            month_of_year=1,
            interval=1,
            created_at=datetime(2027, 1, 1, 8, 0, tzinfo=timezone.utc),
        )

        self.assertTrue(matches_template_date(tmpl, date(2027, 12, 31)))
        self.assertFalse(matches_template_date(tmpl, date(2028, 1, 1)))
        run_at = first_run_at(tmpl, datetime(2027, 1, 2, 8, 0, tzinfo=timezone.utc))
        self.assertEqual(run_at.isoformat(), "2027-12-31T08:00:00+00:00")

    def test_yearly_interval_uses_nominal_year(self) -> None:
        tmpl = SimpleNamespace(
            frequency=FrequencyType.YEARLY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_month=1,
            month_of_year=1,
            interval=2,
            apply_from=datetime(2026, 1, 2, 8, 0, tzinfo=timezone.utc),
            created_at=datetime(2026, 1, 2, 8, 0, tzinfo=timezone.utc),
        )

        self.assertFalse(matches_template_date(tmpl, date(2026, 12, 31)))
        self.assertTrue(matches_template_date(tmpl, date(2027, 12, 31)))

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
