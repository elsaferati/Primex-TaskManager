from __future__ import annotations

from datetime import time
from unittest import TestCase

from app.services.primeflow_report_schedule_config import (
    DEFAULT_1H_SCHEDULES,
    DEFAULT_TIMEZONE,
    DEFAULT_WEEKDAYS,
    default_schedule_validation_errors,
)


def _valid_rows() -> list[dict[str, object]]:
    return [
        {
            "name": schedule.name,
            "report_slot": schedule.report_slot,
            "execution_time": schedule.execution_time,
            "timezone": DEFAULT_TIMEZONE,
            "weekdays": list(DEFAULT_WEEKDAYS),
            "is_default": True,
            "backfill_enabled": True,
            "predecessor_name": schedule.predecessor_name,
        }
        for schedule in DEFAULT_1H_SCHEDULES
    ]


class PrimeFlowReportScheduleConfigTests(TestCase):
    def test_defaults_restore_every_weekday_slot(self) -> None:
        self.assertEqual(
            [(row.report_slot, row.execution_time) for row in DEFAULT_1H_SCHEDULES],
            [
                ("10:00", time(9, 0)),
                ("11:00", time(10, 50)),
                ("11:50", time(11, 40)),
                ("14:10", time(14, 10)),
                ("14:20", time(14, 20)),
                ("15:50", time(15, 50)),
            ],
        )
        self.assertEqual(DEFAULT_WEEKDAYS, (0, 1, 2, 3, 4))
        self.assertEqual(default_schedule_validation_errors(_valid_rows()), [])

    def test_validation_detects_missing_or_changed_schedule(self) -> None:
        rows = _valid_rows()
        rows.pop()
        rows[1]["execution_time"] = time(10, 45)

        errors = default_schedule_validation_errors(rows)

        self.assertTrue(any("missing active defaults: 1H 15:50" in error for error in errors))
        self.assertTrue(any("1H 11:00" in error and "execution_time" in error for error in errors))

    def test_validation_ignores_defaults_for_other_report_types(self) -> None:
        rows = _valid_rows()
        rows.append(
            {
                "name": "RLZ Daily Control 16:00",
                "report_type": "RLZ_DAILY_CONTROL",
                "report_slot": None,
                "execution_time": time(16, 0),
                "timezone": DEFAULT_TIMEZONE,
                "weekdays": list(DEFAULT_WEEKDAYS),
                "is_default": True,
                "backfill_enabled": False,
                "predecessor_name": None,
            }
        )

        self.assertEqual(default_schedule_validation_errors(rows), [])
