from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, insert, select

from app.db import SessionLocal
from app.models.enums import TaskPriority, TaskStatus
from app.models.system_task_template import SystemTaskTemplate
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.services.system_task_schedule import matches_template_date, should_reopen_system_task
from app.services.system_task_occurrences import ensure_occurrences_in_range


async def generate_system_tasks() -> int:
    created = 0
    now = datetime.now(timezone.utc)
    today = now.date()
    
    async with SessionLocal() as db:
        templates = (await db.execute(select(SystemTaskTemplate))).scalars().all()
        
        for tmpl in templates:
            active_value = tmpl.is_active and not (
                tmpl.department_id is not None and tmpl.default_assignee_id is None
            )
            
            if not active_value:
                continue
            
            # Get all assignees from the array (safely handle NULL or missing field)
            assignee_ids = getattr(tmpl, 'assignee_ids', None) or []
            if not assignee_ids and tmpl.default_assignee_id:
                assignee_ids = [tmpl.default_assignee_id]
            
            if not assignee_ids:
                continue
            
            # Check if tasks should be created for today based on frequency
            if not matches_template_date(tmpl, today):
                continue
            
            # Create a task for EACH assignee
            for assignee_id in assignee_ids:
                # Get user to determine department
                user = (
                    await db.execute(select(User).where(User.id == assignee_id))
                ).scalar_one_or_none()
                
                if not user:
                    continue
                
                # Check if task already exists for this user and date
                existing_task = (
                    await db.execute(
                        select(Task)
                        .where(
                            Task.system_template_origin_id == tmpl.id,
                            Task.assigned_to == assignee_id,
                            func.date(Task.start_date) == today
                        )
                    )
                ).scalar_one_or_none()
                
                if existing_task is None:
                    task = Task(
                        title=tmpl.title,
                        description=tmpl.description,
                        internal_notes=tmpl.internal_notes,
                        department_id=user.department_id or tmpl.department_id,
                        assigned_to=assignee_id,
                        created_by=assignee_id,
                        status=TaskStatus.TODO,
                        priority=tmpl.priority or TaskPriority.NORMAL,
                        finish_period=tmpl.finish_period,
                        system_template_origin_id=tmpl.id,
                        start_date=now,
                        is_active=active_value,
                    )
                    db.add(task)
                    await db.flush()
                    
                    # Add single assignee to TaskAssignee table
                    await db.execute(
                        insert(TaskAssignee),
                        [{"task_id": task.id, "user_id": assignee_id}],
                    )
                    created += 1
                else:
                    # Update existing task if template changed
                    existing_task.title = tmpl.title
                    existing_task.description = tmpl.description
                    existing_task.internal_notes = tmpl.internal_notes
                    existing_task.department_id = user.department_id or tmpl.department_id
                    existing_task.finish_period = tmpl.finish_period
                    existing_task.is_active = active_value
                    existing_task.priority = tmpl.priority or TaskPriority.NORMAL
                    
                    if active_value and should_reopen_system_task(existing_task, tmpl, now):
                        existing_task.status = TaskStatus.TODO
                        existing_task.completed_at = None
        
        # Ensure today's occurrences exist.
        await ensure_occurrences_in_range(db=db, start=today, end=today)

        await db.commit()

    return created

