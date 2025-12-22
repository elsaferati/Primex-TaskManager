from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models.enums import FrequencyType, NotificationType, TaskPriority, TaskStatus
from app.models.notification import Notification
from app.models.task import Task
from app.models.system_task_template import SystemTaskTemplate
from app.services.audit import add_audit_log
from app.services.notifications import add_notification, publish_notification


def _should_run(template: SystemTaskTemplate, today: date) -> bool:
    if template.frequency == FrequencyType.DAILY:
        return True
    if template.frequency == FrequencyType.WEEKLY:
        if template.day_of_week is None:
            return today.weekday() == 0
        return today.weekday() == template.day_of_week
    if template.frequency == FrequencyType.MONTHLY:
        if template.day_of_month is None:
            return today.day == 1
        return today.day == template.day_of_month
    if template.frequency == FrequencyType.YEARLY:
        if template.month_of_year is not None and today.month != template.month_of_year:
            return False
        if template.day_of_month is not None and today.day != template.day_of_month:
            return False
        return True
    if template.frequency == FrequencyType.THREE_MONTHS:
        if template.month_of_year is not None and today.month != template.month_of_year:
            return False
        if template.day_of_month is not None and today.day != template.day_of_month:
            return False
        return today.month % 3 == 0
    if template.frequency == FrequencyType.SIX_MONTHS:
        if template.month_of_year is not None and today.month != template.month_of_year:
            return False
        if template.day_of_month is not None and today.day != template.day_of_month:
            return False
        return today.month % 6 == 0
    return False


async def generate_system_tasks() -> int:
    today = datetime.now(timezone.utc).date()
    created = 0
    async with SessionLocal() as db:
        templates = (
            await db.execute(
                select(SystemTaskTemplate).where(SystemTaskTemplate.is_active.is_(True))
            )
        ).scalars().all()
        created_notifications: list[Notification] = []

        for tmpl in templates:
            if tmpl.department_id is None:
                continue
            if not _should_run(tmpl, today):
                continue

            existing = (
                await db.execute(
                    select(Task.id).where(
                        Task.system_template_origin_id == tmpl.id,
                        func.date(Task.start_date) == today,
                    )
                )
            ).scalar_one_or_none()
            if existing is not None:
                continue

            task = Task(
                department_id=tmpl.department_id,
                project_id=None,
                title=tmpl.title,
                description=tmpl.description,
                status=TaskStatus.TODO,
                priority=TaskPriority.MEDIUM,
                assigned_to=tmpl.default_assignee_id,
                created_by=tmpl.default_assignee_id,
                system_template_origin_id=tmpl.id,
                start_date=datetime.now(timezone.utc),
            )
            db.add(task)
            await db.flush()

            add_audit_log(
                db=db,
                actor_user_id=None,
                entity_type="task",
                entity_id=task.id,
                action="system_generated",
                after={"template_id": str(tmpl.id), "run_date": today.isoformat()},
            )

            if tmpl.default_assignee_id is not None:
                created_notifications.append(
                    add_notification(
                        db=db,
                        user_id=tmpl.default_assignee_id,
                        type=NotificationType.assignment,
                        title="System task assigned",
                        body=tmpl.title,
                        data={"task_id": str(task.id), "template_id": str(tmpl.id)},
                    )
                )

            created += 1

        await db.commit()

        for n in created_notifications:
            try:
                await publish_notification(user_id=n.user_id, notification=n)
            except Exception:
                pass

    return created

