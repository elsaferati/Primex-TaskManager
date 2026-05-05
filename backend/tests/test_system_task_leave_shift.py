from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest import TestCase
from zoneinfo import ZoneInfo

from app.services.system_task_instances import (
    _all_template_assignees_on_leave,
    _build_annual_leave_snapshot,
    _parse_annual_leave_entry,
    _resolve_shifted_occurrence_local_dt,
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
            _all_template_assignees_on_leave([user_id], date(2026, 5, 1), leave_by_user, all_users_ranges)
        )

    def test_all_assignees_individual_leave_blocks_date(self) -> None:
        first_user_id = uuid.uuid4()
        second_user_id = uuid.uuid4()
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
            _all_template_assignees_on_leave(
                [first_user_id, second_user_id],
                date(2026, 5, 1),
                leave_by_user,
                all_users_ranges,
            )
        )

    def test_partial_day_leave_does_not_block_shift(self) -> None:
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
            _all_template_assignees_on_leave([user_id], date(2026, 5, 1), leave_by_user, all_users_ranges)
        )

    def test_shift_moves_may_first_to_previous_working_day(self) -> None:
        user_id = uuid.uuid4()
        tz = ZoneInfo("Europe/Budapest")
        occurrence_local = datetime(2026, 5, 1, 9, 0, tzinfo=tz)
        leave_by_user, all_users_ranges = _build_annual_leave_snapshot(
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

        shifted = _resolve_shifted_occurrence_local_dt(
            occurrence_local,
            [user_id],
            leave_by_user,
            all_users_ranges,
        )

        self.assertEqual(shifted.date(), date(2026, 4, 30))

    def test_shift_skips_back_over_consecutive_blocked_days_and_weekend(self) -> None:
        user_id = uuid.uuid4()
        tz = ZoneInfo("Europe/Budapest")
        occurrence_local = datetime(2026, 5, 4, 9, 0, tzinfo=tz)
        leave_by_user, all_users_ranges = _build_annual_leave_snapshot(
            [
                SimpleNamespace(
                    description="[ALL_USERS] Date range: 2026-04-30 to 2026-05-04 (Full day)",
                    entry_date=date(2026, 4, 30),
                    created_at=datetime(2026, 4, 29, 8, 0, tzinfo=timezone.utc),
                    assigned_to_user_id=None,
                    created_by_user_id=user_id,
                )
            ]
        )

        shifted = _resolve_shifted_occurrence_local_dt(
            occurrence_local,
            [user_id],
            leave_by_user,
            all_users_ranges,
        )

        self.assertEqual(shifted.date(), date(2026, 4, 29))
