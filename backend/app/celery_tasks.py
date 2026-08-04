from __future__ import annotations

import asyncio
from datetime import date

from app.celery_app import celery_app
from app.jobs.carryover import run_carryover as _run_carryover
from app.jobs.ga_notes_cleanup import cleanup_old_closed_ga_notes as _cleanup_old_closed_ga_notes
from app.jobs.internal_notes_cleanup import cleanup_old_done_internal_notes as _cleanup_old_done_internal_notes
from app.jobs.internal_meeting_sessions import (
    reset_expired_internal_meeting_sessions as _reset_expired_internal_meeting_sessions,
)
from app.jobs.overdue import process_overdue as _process_overdue
from app.jobs.realization import (
    generate_daily_realization_snapshots as _generate_daily_realization_snapshots,
    generate_weekly_realization_results as _generate_weekly_realization_results,
)
from app.jobs.reminders import process_reminders as _process_reminders
from app.jobs.system_tasks import (
    generate_system_tasks as _generate_system_tasks,
    pregenerate_system_tasks_today as _pregenerate_system_tasks_today,
    reconcile_system_task_slots_daily as _reconcile_system_task_slots_daily,
)
from app.services.weekly_planning_audit_delivery import (
    WeeklyPlanningAuditEmailError,
    cleanup_expired_report_files,
    generate_and_send_scheduled,
)


@celery_app.task(name="app.celery_tasks.generate_system_tasks")
def generate_system_tasks() -> int:
    return asyncio.run(_generate_system_tasks())


@celery_app.task(name="app.celery_tasks.pregenerate_system_tasks_today")
def pregenerate_system_tasks_today() -> int:
    return asyncio.run(_pregenerate_system_tasks_today())


@celery_app.task(name="app.celery_tasks.reconcile_system_task_slots_daily")
def reconcile_system_task_slots_daily() -> dict[str, int]:
    return asyncio.run(_reconcile_system_task_slots_daily())


@celery_app.task(name="app.celery_tasks.process_reminders")
def process_reminders() -> int:
    return asyncio.run(_process_reminders())


@celery_app.task(name="app.celery_tasks.process_overdue")
def process_overdue() -> int:
    return asyncio.run(_process_overdue())


@celery_app.task(name="app.celery_tasks.run_carryover")
def run_carryover() -> dict:
    return asyncio.run(_run_carryover())


@celery_app.task(name="app.celery_tasks.cleanup_old_closed_ga_notes")
def cleanup_old_closed_ga_notes() -> int:
    return asyncio.run(_cleanup_old_closed_ga_notes())


@celery_app.task(name="app.celery_tasks.cleanup_old_done_internal_notes")
def cleanup_old_done_internal_notes() -> int:
    return asyncio.run(_cleanup_old_done_internal_notes())


@celery_app.task(name="app.celery_tasks.reset_expired_internal_meeting_sessions")
def reset_expired_internal_meeting_sessions() -> int:
    return asyncio.run(_reset_expired_internal_meeting_sessions())


@celery_app.task(name="app.celery_tasks.generate_daily_realization_snapshots")
def generate_daily_realization_snapshots() -> dict[str, int]:
    return asyncio.run(_generate_daily_realization_snapshots())


@celery_app.task(name="app.celery_tasks.generate_weekly_realization_results")
def generate_weekly_realization_results() -> dict[str, int]:
    return asyncio.run(_generate_weekly_realization_results())


@celery_app.task(
    bind=True,
    name="app.celery_tasks.send_weekly_planning_audit_report",
    max_retries=4,
)
def send_weekly_planning_audit_report(
    self,
    slot: str,
    week_start: str | None = None,
) -> str | None:
    parsed_week_start = date.fromisoformat(week_start) if week_start else None
    try:
        run_id = asyncio.run(generate_and_send_scheduled(slot, parsed_week_start))
        return str(run_id) if run_id else None
    except WeeklyPlanningAuditEmailError as exc:
        countdown = min(1800, 60 * (2 ** self.request.retries))
        raise self.retry(exc=exc, countdown=countdown)


@celery_app.task(name="app.celery_tasks.cleanup_weekly_planning_audit_files")
def cleanup_weekly_planning_audit_files() -> int:
    return asyncio.run(cleanup_expired_report_files())

