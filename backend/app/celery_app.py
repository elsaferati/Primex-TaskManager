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
celery_app.conf.timezone = settings.WEEKLY_PLANNING_AUDIT_TIMEZONE
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]

celery_app.conf.beat_schedule = {
    "generate-system-tasks-daily": {
        "task": "app.celery_tasks.generate_system_tasks",
        "schedule": crontab(
            day_of_week=settings.SYSTEM_TASK_SCHEDULER_DAY_OF_WEEK,
            hour=settings.SYSTEM_TASK_SCHEDULER_HOUR,
            minute=settings.SYSTEM_TASK_SCHEDULER_MINUTE,
        ),
    },
    "process-reminders": {
        "task": "app.celery_tasks.process_reminders",
        "schedule": crontab(minute="*/5"),
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
    "weekly-planning-audit-0900": {
        "task": "app.celery_tasks.send_weekly_planning_audit_report",
        "schedule": crontab(day_of_week="fri", hour=9, minute=0),
        "args": ("09:00",),
    },
    "weekly-planning-audit-0930": {
        "task": "app.celery_tasks.send_weekly_planning_audit_report",
        "schedule": crontab(day_of_week="fri", hour=9, minute=30),
        "args": ("09:30",),
    },
    "weekly-planning-audit-1000": {
        "task": "app.celery_tasks.send_weekly_planning_audit_report",
        "schedule": crontab(day_of_week="fri", hour=10, minute=0),
        "args": ("10:00",),
    },
    "weekly-planning-audit-1030": {
        "task": "app.celery_tasks.send_weekly_planning_audit_report",
        "schedule": crontab(day_of_week="fri", hour=10, minute=30),
        "args": ("10:30",),
    },
    "weekly-planning-audit-1100": {
        "task": "app.celery_tasks.send_weekly_planning_audit_report",
        "schedule": crontab(day_of_week="fri", hour=11, minute=0),
        "args": ("11:00",),
    },
    "weekly-planning-audit-cleanup": {
        "task": "app.celery_tasks.cleanup_weekly_planning_audit_files",
        "schedule": crontab(day_of_week="sun", hour=3, minute=15),
    },
}

