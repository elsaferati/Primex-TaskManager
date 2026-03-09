from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TaskPriority, TaskStatus
from app.models.system_task_template import SystemTaskTemplate
from app.models.system_task_template_assignee_slot import SystemTaskTemplateAssigneeSlot
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.services.system_task_schedule import first_run_at, next_occurrence, template_due_time, template_tz


def _adjust_due_datetime_local(
    *,
    tz: ZoneInfo,
    due_time: time,
    start_local_dt: datetime,
    duration_days: int,
) -> datetime:
    due_day = start_local_dt.date() + timedelta(days=max(duration_days, 1) - 1)
    due_dt = datetime.combine(due_day, due_time, tzinfo=tz)
    while due_dt.weekday() > 4:
        due_dt = due_dt - timedelta(days=1)
    return due_dt

async def _assignee_department_map(
    db: AsyncSession,
    user_ids: set[uuid.UUID],
) -> dict[uuid.UUID, uuid.UUID | None]:
    if not user_ids:
        return {}
    rows = (
        await db.execute(select(User.id, User.department_id).where(User.id.in_(user_ids)))
    ).all()
    return {user_id: department_id for user_id, department_id in rows}


async def _insert_system_task_instance(
    db: AsyncSession,
    *,
    slot: SystemTaskTemplateAssigneeSlot,
    template: SystemTaskTemplate,
    department_id: uuid.UUID | None,
    origin_run_at: datetime,
    due_utc: datetime,
    now_utc: datetime,
) -> bool:
    assignee_id = slot.primary_user_id
    task_insert = pg_insert(Task).values(
        {
            "id": uuid.uuid4(),
            "title": template.title,
            "description": template.description,
            "internal_notes": template.internal_notes,
            "department_id": department_id,
            "assigned_to": assignee_id,
            "created_by": assignee_id,
            "system_template_origin_id": template.id,
            "system_task_slot_id": slot.id,
            "origin_run_at": origin_run_at,
            "start_date": origin_run_at,
            "due_date": due_utc,
            "status": TaskStatus.TODO,
            "priority": getattr(template, "priority", None) or TaskPriority.NORMAL,
            "finish_period": getattr(template, "finish_period", None),
            "is_active": True,
            "created_at": now_utc,
            "updated_at": now_utc,
        }
    )
    task_insert = task_insert.on_conflict_do_nothing(
        index_elements=["system_template_origin_id", "system_task_slot_id", "origin_run_at"],
        index_where=Task.origin_run_at.is_not(None),
    ).returning(Task.id)

    try:
        async with db.begin_nested():
            inserted_task_id = (await db.execute(task_insert)).scalar_one_or_none()
    except IntegrityError as exc:
        msg = str(exc).lower()
        if "duplicate key value violates unique constraint" in msg and (
            "immutable_date(start_date)" in msg or "uq_tasks_system_template_user_date" in msg
        ):
            inserted_task_id = None
        else:
            raise

    if inserted_task_id is None:
        return False

    await db.execute(
        pg_insert(TaskAssignee)
        .values({"task_id": inserted_task_id, "user_id": assignee_id})
        .on_conflict_do_nothing(index_elements=["task_id", "user_id"])
    )
    return True


async def generate_system_task_instances(
    db: AsyncSession,
    *,
    now_utc: datetime | None = None,
    start: date | None = None,
    end: date | None = None,
) -> int:
    now_utc = now_utc or datetime.now(timezone.utc)
    if start is not None and end is not None and end < start:
        return 0

    await ensure_slots_initialized(db)
    slot_rows = (
        await db.execute(
            select(SystemTaskTemplateAssigneeSlot, SystemTaskTemplate)
            .join(SystemTaskTemplate, SystemTaskTemplateAssigneeSlot.template_id == SystemTaskTemplate.id)
            .where(SystemTaskTemplateAssigneeSlot.is_active.is_(True))
            .where(SystemTaskTemplate.is_active.is_(True))
            .with_for_update(skip_locked=True)
        )
    ).all()
    if not slot_rows:
        return 0

    department_map = await _assignee_department_map(
        db,
        {slot.primary_user_id for slot, _ in slot_rows},
    )

    created = 0
    for slot, template in slot_rows:
        tz = template_tz(template)
        due_time = template_due_time(template)
        range_end = end if end is not None else now_utc.astimezone(tz).date()
        range_start = start
        next_run = slot.next_run_at or first_run_at(template, now_utc)

        while True:
            occurrence_local = next_run.astimezone(tz)
            occurrence_day = occurrence_local.date()
            if occurrence_day > range_end:
                break
            if range_start is not None and occurrence_day < range_start:
                next_run = next_occurrence(template, next_run)
                continue

            due_local = _adjust_due_datetime_local(
                tz=tz,
                due_time=due_time,
                start_local_dt=occurrence_local,
                duration_days=int(getattr(template, "duration_days", 1) or 1),
            )
            inserted = await _insert_system_task_instance(
                db,
                slot=slot,
                template=template,
                department_id=department_map.get(slot.primary_user_id) or template.department_id,
                origin_run_at=next_run,
                due_utc=due_local.astimezone(timezone.utc),
                now_utc=now_utc,
            )
            if inserted:
                created += 1

            next_run = next_occurrence(template, next_run)

        slot.next_run_at = next_run

    return created


async def ensure_task_instances_in_range(
    db: AsyncSession,
    *,
    start: date,
    end: date,
) -> int:
    return await generate_system_task_instances(
        db,
        now_utc=datetime.now(timezone.utc),
        start=start,
        end=end,
    )


async def ensure_due_today_instances_best_effort(
    db: AsyncSession,
    *,
    now_utc: datetime | None = None,
) -> int:
    now_utc = now_utc or datetime.now(timezone.utc)
    created = await generate_system_task_instances(db=db, now_utc=now_utc)
    await db.commit()
    return created


async def ensure_slots_initialized(db: AsyncSession) -> None:
    templates = (
        await db.execute(select(SystemTaskTemplate).where(SystemTaskTemplate.is_active.is_(True)))
    ).scalars().all()
    if not templates:
        return

    template_ids = [template.id for template in templates]
    existing_pairs = {
        (template_id, primary_user_id)
        for template_id, primary_user_id in (
            await db.execute(
                select(
                    SystemTaskTemplateAssigneeSlot.template_id,
                    SystemTaskTemplateAssigneeSlot.primary_user_id,
                ).where(SystemTaskTemplateAssigneeSlot.template_id.in_(template_ids))
            )
        ).all()
    }
    now_utc = datetime.now(timezone.utc)
    pending_values: list[dict[str, object]] = []

    for template in templates:
        assignee_ids = list(getattr(template, "assignee_ids", None) or [])
        if not assignee_ids and template.default_assignee_id:
            assignee_ids = [template.default_assignee_id]
        for assignee_id in assignee_ids:
            pair = (template.id, assignee_id)
            if pair in existing_pairs:
                continue
            pending_values.append(
                {
                    "id": uuid.uuid4(),
                    "template_id": template.id,
                    "primary_user_id": assignee_id,
                    "next_run_at": first_run_at(template, now_utc),
                    "is_active": True,
                    "created_at": now_utc,
                    "updated_at": now_utc,
                }
            )
            existing_pairs.add(pair)

    if pending_values:
        await db.execute(insert(SystemTaskTemplateAssigneeSlot), pending_values)


async def reconcile_system_task_slots(
    db: AsyncSession,
    *,
    now_utc: datetime | None = None,
    lookback_days: int = 30,
) -> dict[str, int]:
    del lookback_days
    created_tasks = await generate_system_task_instances(db=db, now_utc=now_utc)
    return {"rewound_slots": 0, "created_tasks": created_tasks}
