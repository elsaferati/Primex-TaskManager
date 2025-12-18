from __future__ import annotations

from datetime import date, datetime, timezone, timedelta

from sqlalchemy import select

from app.models.enums import NotificationType, TaskType, TemplateRecurrence
from app.models.notification import Notification
from app.models.project import Project
from app.models.task import Task
from app.models.task_template import TaskTemplate
from app.models.task_template_run import TaskTemplateRun
from app.services.audit import add_audit_log
from app.services.notifications import add_notification, publish_notification
from app.db import SessionLocal


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _year_start(d: date) -> date:
    return d.replace(month=1, day=1)


def _run_key_for(recurrence: TemplateRecurrence, today: date) -> date:
    if recurrence == TemplateRecurrence.daily:
        return today
    if recurrence == TemplateRecurrence.weekly:
        return _week_start(today)
    if recurrence == TemplateRecurrence.monthly:
        return _month_start(today)
    return _year_start(today)


async def generate_system_tasks() -> int:
    today = datetime.now(timezone.utc).date()
    created = 0
    async with SessionLocal() as db:
        templates = (await db.execute(select(TaskTemplate).where(TaskTemplate.is_active.is_(True)))).scalars().all()
        created_notifications: list[Notification] = []

        for tmpl in templates:
            run_key = _run_key_for(tmpl.recurrence, today)
            exists = (
                await db.execute(
                    select(TaskTemplateRun.id).where(TaskTemplateRun.template_id == tmpl.id, TaskTemplateRun.run_key == run_key)
                )
            ).scalar_one_or_none()
            if exists is not None:
                continue

            project_id = tmpl.project_id
            if project_id is None:
                project_id = (
                    await db.execute(
                        select(Project.id).where(Project.board_id == tmpl.board_id).order_by(Project.created_at).limit(1)
                    )
                ).scalar_one_or_none()
                if project_id is None:
                    continue

            task = Task(
                department_id=tmpl.department_id,
                board_id=tmpl.board_id,
                project_id=project_id,
                title=tmpl.title,
                description=tmpl.description,
                task_type=TaskType.system,
                status_id=tmpl.default_status_id,
                position=0,
                assigned_to_user_id=tmpl.assigned_to_user_id,
                created_by_user_id=tmpl.created_by_user_id,
                planned_for=run_key,
            )
            db.add(task)
            await db.flush()
            db.add(TaskTemplateRun(template_id=tmpl.id, run_key=run_key, task_id=task.id))

            add_audit_log(
                db=db,
                actor_user_id=None,
                entity_type="task",
                entity_id=task.id,
                action="system_generated",
                after={"template_id": str(tmpl.id), "run_key": run_key.isoformat()},
            )

            if tmpl.assigned_to_user_id is not None:
                created_notifications.append(
                    add_notification(
                        db=db,
                        user_id=tmpl.assigned_to_user_id,
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
