from __future__ import annotations

import os
import uuid
from datetime import datetime, time
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-long-enough-for-tests")

import report_scheduler


class _FakeSession:
    def __init__(self, schedule) -> None:
        self.schedule = schedule

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        return None

    async def get(self, _model, row_id):
        return self.schedule if row_id == self.schedule.id else None


def _friday_schedule(*, active: bool = True, backfill: bool = False):
    return SimpleNamespace(
        id=uuid.uuid4(),
        report_slot="10:00",
        execution_time=time(9, 0),
        timezone="Europe/Tirane",
        weekdays=[4],
        is_active=active,
        backfill_enabled=backfill,
        predecessor_schedule_id=None,
        version=2,
    )


class PrimeFlowReportSchedulerTests(IsolatedAsyncioTestCase):
    async def test_friday_schedule_without_backfill_sends_only_current_report(self) -> None:
        schedule = _friday_schedule()
        friday = datetime(2026, 7, 31, 9, 0, tzinfo=ZoneInfo("Europe/Tirane"))

        with (
            patch.object(report_scheduler, "SessionLocal", new=lambda: _FakeSession(schedule)),
            patch.object(report_scheduler, "datetime", new=SimpleNamespace(now=lambda _timezone: friday)),
            patch.object(report_scheduler, "deliver_report", new=AsyncMock()) as deliver,
            patch.object(report_scheduler, "execute_chain", new=AsyncMock()) as chain,
        ):
            await report_scheduler.scheduled_job(
                str(schedule.id), schedule.report_slot, schedule.version, schedule.timezone,
            )

        deliver.assert_awaited_once_with(
            friday.date(), "10:00", schedule_id=str(schedule.id), schedule_version=2,
            scheduled_for=friday, trigger_type="SCHEDULED",
        )
        chain.assert_not_awaited()

    async def test_job_is_skipped_outside_configured_weekday(self) -> None:
        schedule = _friday_schedule()
        monday = datetime(2026, 7, 27, 9, 0, tzinfo=ZoneInfo("Europe/Tirane"))

        with (
            patch.object(report_scheduler, "SessionLocal", new=lambda: _FakeSession(schedule)),
            patch.object(report_scheduler, "datetime", new=SimpleNamespace(now=lambda _timezone: monday)),
            patch.object(report_scheduler, "deliver_report", new=AsyncMock()) as deliver,
            patch.object(report_scheduler, "execute_chain", new=AsyncMock()) as chain,
        ):
            await report_scheduler.scheduled_job(
                str(schedule.id), schedule.report_slot, schedule.version, schedule.timezone,
            )

        deliver.assert_not_awaited()
        chain.assert_not_awaited()

    async def test_stale_scheduler_version_cannot_send(self) -> None:
        schedule = _friday_schedule()
        friday = datetime(2026, 7, 31, 9, 0, tzinfo=ZoneInfo("Europe/Tirane"))

        with (
            patch.object(report_scheduler, "SessionLocal", new=lambda: _FakeSession(schedule)),
            patch.object(report_scheduler, "datetime", new=SimpleNamespace(now=lambda _timezone: friday)),
            patch.object(report_scheduler, "deliver_report", new=AsyncMock()) as deliver,
        ):
            await report_scheduler.scheduled_job(
                str(schedule.id), schedule.report_slot, schedule.version - 1, schedule.timezone,
            )

        deliver.assert_not_awaited()
