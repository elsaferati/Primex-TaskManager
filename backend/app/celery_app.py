from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.config import settings


celery_app = Celery(
    "primex_nexus",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.celery_tasks"],
)

celery_app.conf.enable_utc = True
celery_app.conf.timezone = settings.APP_TIMEZONE
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]

celery_app.conf.beat_schedule = {
    "generate-system-tasks": {
        "task": "app.celery_tasks.generate_system_tasks",
        "schedule": crontab(minute="*/15"),
    },
    "pregenerate-system-tasks-by-7am": {
        "task": "app.celery_tasks.pregenerate_system_tasks_by_7am",
        "schedule": crontab(minute=50, hour=6),
    },
    "reconcile-system-task-slots": {
        "task": "app.celery_tasks.reconcile_system_task_slots",
        "schedule": crontab(minute=30, hour=6),
    },
    "process-reminders": {
        "task": "app.celery_tasks.process_reminders",
        "schedule": crontab(minute="*/1"),
    },
    "process-overdue": {
        "task": "app.celery_tasks.process_overdue",
        "schedule": crontab(minute="*/30"),
    },
    "run-carryover": {
        "task": "app.celery_tasks.run_carryover",
        "schedule": crontab(minute=5, hour=0),
    },
    "cleanup-old-closed-ga-notes": {
        "task": "app.celery_tasks.cleanup_old_closed_ga_notes",
        "schedule": crontab(minute=0, hour=2),  # Run daily at 2 AM UTC
    },
    "cleanup-old-done-internal-notes": {
        "task": "app.celery_tasks.cleanup_old_done_internal_notes",
        "schedule": crontab(minute=30, hour=2),  # Run daily at 2:30 AM UTC
    },
    "reset-expired-internal-meeting-sessions": {
        "task": "app.celery_tasks.reset_expired_internal_meeting_sessions",
        "schedule": crontab(minute="*/15"),
    },
}

