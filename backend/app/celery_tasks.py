from __future__ import annotations

import asyncio

from app.celery_app import celery_app
from app.jobs.carryover import run_carryover as _run_carryover
from app.jobs.overdue import process_overdue as _process_overdue
from app.jobs.reminders import process_reminders as _process_reminders
from app.jobs.system_tasks import generate_system_tasks as _generate_system_tasks


@celery_app.task(name="app.celery_tasks.generate_system_tasks")
def generate_system_tasks() -> int:
    return asyncio.run(_generate_system_tasks())


@celery_app.task(name="app.celery_tasks.process_reminders")
def process_reminders() -> int:
    return asyncio.run(_process_reminders())


@celery_app.task(name="app.celery_tasks.process_overdue")
def process_overdue() -> int:
    return asyncio.run(_process_overdue())


@celery_app.task(name="app.celery_tasks.run_carryover")
def run_carryover() -> dict:
    return asyncio.run(_run_carryover())


