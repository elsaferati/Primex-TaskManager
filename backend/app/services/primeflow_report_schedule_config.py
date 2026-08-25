from __future__ import annotations

from dataclasses import dataclass
from datetime import time
from typing import Mapping, Sequence


DEFAULT_TIMEZONE = "Europe/Tirane"
DEFAULT_WEEKDAYS = (0, 1, 2, 3, 4)


@dataclass(frozen=True, slots=True)
class PrimeFlowReportScheduleDefault:
    name: str
    report_slot: str
    execution_time: time
    sort_order: int
    predecessor_name: str | None


DEFAULT_1H_SCHEDULES = (
    PrimeFlowReportScheduleDefault("1H 10:00", "10:00", time(9, 0), 10, None),
    PrimeFlowReportScheduleDefault("1H 11:00", "11:00", time(11, 0), 20, "1H 10:00"),
    PrimeFlowReportScheduleDefault("1H 11:50", "11:50", time(11, 50), 30, "1H 11:00"),
    PrimeFlowReportScheduleDefault("1H 14:10", "14:10", time(14, 20), 40, "1H 11:50"),
    PrimeFlowReportScheduleDefault("1H Today 14:20", "14:20", time(14, 20), 50, "1H 14:10"),
    PrimeFlowReportScheduleDefault("1H 15:50", "15:50", time(15, 50), 60, "1H Today 14:20"),
)


def default_schedule_validation_errors(rows: Sequence[Mapping[str, object]]) -> list[str]:
    expected_by_name = {schedule.name: schedule for schedule in DEFAULT_1H_SCHEDULES}
    # Default schedules are now shared by more than one report type.  This
    # validator protects only the built-in 1H chain; a valid RLZ schedule must
    # not make that chain appear to have an unexpected default.
    actual_by_name = {
        str(row["name"]): row
        for row in rows
        if row.get("report_type", "ONE_H") == "ONE_H"
    }
    errors: list[str] = []

    missing = sorted(set(expected_by_name) - set(actual_by_name))
    unexpected = sorted(set(actual_by_name) - set(expected_by_name))
    if missing:
        errors.append(f"missing active defaults: {', '.join(missing)}")
    if unexpected:
        errors.append(f"unexpected active defaults: {', '.join(unexpected)}")

    for name, expected in expected_by_name.items():
        row = actual_by_name.get(name)
        if row is None:
            continue
        expected_fields = {
            "report_slot": expected.report_slot,
            "execution_time": expected.execution_time,
            "timezone": DEFAULT_TIMEZONE,
            "weekdays": list(DEFAULT_WEEKDAYS),
            "is_default": True,
            "backfill_enabled": True,
            "predecessor_name": expected.predecessor_name,
        }
        mismatches = {
            field: {"expected": expected_value, "actual": row.get(field)}
            for field, expected_value in expected_fields.items()
            if row.get(field) != expected_value
        }
        if mismatches:
            errors.append(f"{name}: {mismatches}")
    return errors
