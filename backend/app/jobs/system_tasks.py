from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db import SessionLocal
from app.models.enums import SystemTaskOutcome, TaskPriority, TaskStatus
from app.models.system_task_template import SystemTaskTemplate
from app.models.system_task_template_assignee import SystemTaskTemplateAssignee
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.services.system_task_recurrence import first_run_at, next_run_at


async def generate_system_tasks() -> int:
    created = 0
    now = datetime.now(timezone.utc)
    
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(SystemTaskTemplateAssignee, SystemTaskTemplate)
                .join(SystemTaskTemplate, SystemTaskTemplate.id == SystemTaskTemplateAssignee.template_id)
                .where(SystemTaskTemplateAssignee.active.is_(True))
                .where(SystemTaskTemplate.is_active.is_(True))
            )
        ).all()
        if not rows:
            return 0

        user_ids = {assignee.user_id for assignee, _ in rows}
        users = (
            await db.execute(select(User).where(User.id.in_(user_ids)))
        ).scalars().all()
        user_map = {user.id: user for user in users}

        for assignee_row, tmpl in rows:
            user = user_map.get(assignee_row.user_id)
            if user is None:
                continue

            next_run = assignee_row.next_run_at or first_run_at(tmpl, now)
            assignee_row.next_run_at = next_run

            lookahead_days = tmpl.lookahead_days or 30
            horizon = now + timedelta(days=lookahead_days)

            while next_run <= horizon:
                priority_value = tmpl.priority or TaskPriority.NORMAL
                if hasattr(priority_value, "value"):
                    priority_value = priority_value.value
                finish_period_value = tmpl.finish_period
                if hasattr(finish_period_value, "value"):
                    finish_period_value = finish_period_value.value
                task_insert = (
                    pg_insert(Task)
                    .values(
                        {
                            "title": tmpl.title,
                            "description": tmpl.description,
                            "internal_notes": tmpl.internal_notes,
                            "department_id": user.department_id or tmpl.department_id,
                            "assigned_to": assignee_row.user_id,
                            "created_by": assignee_row.user_id,
                            "status": TaskStatus.TODO.value,
                            "priority": priority_value,
                            "finish_period": finish_period_value,
                            "system_template_origin_id": tmpl.id,
                            "start_date": next_run,
                            "due_date": next_run,
                            "original_due_date": next_run,
                            "origin_run_at": next_run,
                            "system_outcome": SystemTaskOutcome.OPEN.value,
                            "is_active": True,
                        }
                    )
                    .returning(Task.id)
                )
                task_insert = task_insert.on_conflict_do_nothing(
                    index_elements=["system_template_origin_id", "assigned_to", "origin_run_at"],
                    index_where=Task.origin_run_at.is_not(None),
                )
                result = await db.execute(task_insert)
                new_task_id = result.scalar_one_or_none()
                if new_task_id:
                    await db.execute(
                        pg_insert(TaskAssignee)
                        .values({"task_id": new_task_id, "user_id": assignee_row.user_id})
                        .on_conflict_do_nothing(
                            index_elements=["task_id", "user_id"],
                        )
                    )
                    created += 1

                next_run = next_run_at(next_run, tmpl)

            assignee_row.next_run_at = next_run
            assignee_row.updated_at = now

        await db.commit()

    return created

