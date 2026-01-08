from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import insert, select

from app.db import SessionLocal
from app.models.enums import TaskPriority, TaskStatus
from app.models.system_task_template import SystemTaskTemplate
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.services.system_task_schedule import should_reopen_system_task


async def generate_system_tasks() -> int:
    created = 0
    now = datetime.now(timezone.utc)
    async with SessionLocal() as db:
        templates = (await db.execute(select(SystemTaskTemplate))).scalars().all()
        for tmpl in templates:
            task = (
                await db.execute(
                    select(Task).where(Task.system_template_origin_id == tmpl.id)
                )
            ).scalar_one_or_none()
            active_value = tmpl.is_active and not (
                tmpl.department_id is not None and tmpl.default_assignee_id is None
            )

            if task is None:
                task = Task(
                    title=tmpl.title,
                    description=tmpl.description,
                    internal_notes=tmpl.internal_notes,
                    department_id=tmpl.department_id,
                    assigned_to=tmpl.default_assignee_id,
                    created_by=tmpl.default_assignee_id,
                    status=TaskStatus.TODO,
                    priority=tmpl.priority or TaskPriority.NORMAL,
                    finish_period=tmpl.finish_period,
                    system_template_origin_id=tmpl.id,
                    start_date=now,
                    is_active=active_value,
                )
                db.add(task)
                await db.flush()
                if tmpl.default_assignee_id is not None:
                    await db.execute(
                        insert(TaskAssignee),
                        [{"task_id": task.id, "user_id": tmpl.default_assignee_id}],
                    )
                created += 1
            else:
                task.title = tmpl.title
                task.description = tmpl.description
                task.internal_notes = tmpl.internal_notes
                task.department_id = tmpl.department_id
                task.assigned_to = tmpl.default_assignee_id
                task.finish_period = tmpl.finish_period
                task.is_active = active_value
                if active_value and should_reopen_system_task(task, tmpl, now):
                    task.status = TaskStatus.TODO
                    task.completed_at = None

        await db.commit()

    return created

