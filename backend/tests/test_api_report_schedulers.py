from __future__ import annotations

import unittest
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

from app import main


REPORT_LOOPS = (
    "meetings_report",
    "m3_reporting_points",
    "after_break_report",
    "end_week_bz_report",
    "morning_report",
    "tomorrow_print_report",
    "today_print_report",
)


class ApiReportSchedulerTests(unittest.IsolatedAsyncioTestCase):
    async def check_startup(self, enabled: bool, print_enabled: bool = True) -> None:
        flags = {
            "REDIS_ENABLED": False,
            "SYSTEM_TASK_SCHEDULER_ENABLED": False,
            "STD_FEEDBACK_SYNC_ENABLED": False,
            "MS_CALENDAR_SYNC_ENABLED": False,
            "MEETING_REMINDER_SCHEDULER_ENABLED": False,
            "REPORT_SCHEDULERS_ENABLED": enabled,
            "TOMORROW_PRINT_REPORT_SCHEDULER_ENABLED": print_enabled,
            "TODAY_PRINT_REPORT_SCHEDULER_ENABLED": print_enabled,
        }
        with ExitStack() as stack:
            for key, value in flags.items():
                stack.enter_context(patch.object(main.settings, key, value))
            loops = {
                name: stack.enter_context(
                    patch.object(main, f"run_{name}_scheduler_forever", new_callable=AsyncMock)
                )
                for name in REPORT_LOOPS
            }
            try:
                await main._startup()
                for name, loop in loops.items():
                    expected = enabled and (print_enabled or "print" not in name)
                    self.assertEqual(loop.call_count, int(expected), name)
                    self.assertEqual(
                        getattr(main, f"{name}_scheduler_task") is not None, expected, name
                    )
            finally:
                await main._shutdown()
            for name in REPORT_LOOPS:
                self.assertIsNone(getattr(main, f"{name}_scheduler_task"), name)

    async def test_local_api_does_not_start_any_report_loop(self) -> None:
        await self.check_startup(enabled=False)

    async def test_enabled_api_starts_all_report_loops(self) -> None:
        await self.check_startup(enabled=True)

    async def test_print_report_flags_still_apply(self) -> None:
        await self.check_startup(enabled=True, print_enabled=False)
