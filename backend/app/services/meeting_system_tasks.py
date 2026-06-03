from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import FrequencyType, SystemTaskScope, TaskFinishPeriod, TaskPriority, TaskStatus
from app.models.meeting import Meeting
from app.models.system_task_template import SystemTaskTemplate
from app.models.system_task_template_assignee_slot import SystemTaskTemplateAssigneeSlot
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User

EXTERNAL_MEETING_TASK_KIND = "external_meeting_prepare"
EXTERNAL_MEETING_TRIGGER_TYPE = "EXTERNAL_MEETING_ONCE"
EXTERNAL_MEETING_TASK_TITLE = "TESTIMI I AGENTAVE PARA TAK"
EXTERNAL_MEETING_TASK_DESCRIPTION = (
    "1. Para çdo takimi extern duhet të testohen agjentat përkatës që do të prezantohen ose "
    "diskutohen në takim.\n"
    "2. Testimi bëhet para fillimit të takimit dhe duhet të konfirmojë që agjenti funksionon "
    "saktë, përgjigjet siç duhet dhe nuk ka probleme teknike ose logjike.\n"
    "3. Gjatë testimit plotësohet checklista me emrin \"Testimi i Agent\" te Meetings në "
    "Development Department.\n"
    "4. Pas përfundimit të testimit, checklista e testuar dërgohet në grup dhe njoftohen GA "
    "dhe KA për agjentat e testuar dhe rezultatin e testimit."
)
EXTERNAL_MEETING_TASK_TIME = time(8, 0)
EXTERNAL_MEETING_ASSIGNEE_NAMES = (
    "Laurent Hoxha",
    "Endi Hyseni",
    "Elsa Ferati",
    "Rinesa Ahmedi",
)


def _app_tz() -> ZoneInfo:
    try:
        return ZoneInfo(settings.APP_TIMEZONE)
    except Exception:
        return ZoneInfo("UTC")


def is_one_time_external_meeting(meeting: Meeting | object) -> bool:
    recurrence_type = (getattr(meeting, "recurrence_type", None) or "").strip().lower()
    return (
        (getattr(meeting, "meeting_type", None) or "external") == "external"
        and recurrence_type in ("", "none")
        and getattr(meeting, "starts_at", None) is not None
    )


def meeting_occurrence_date(meeting: Meeting | object) -> date | None:
    starts_at = getattr(meeting, "starts_at", None)
    if starts_at is None:
        return None
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    return starts_at.astimezone(_app_tz()).date()


def meeting_task_start_at(occurrence_date: date) -> datetime:
    local_dt = datetime.combine(occurrence_date, EXTERNAL_MEETING_TASK_TIME, tzinfo=_app_tz())
    return local_dt.astimezone(timezone.utc)


def _local_day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    local_start = datetime.combine(day, time.min, tzinfo=_app_tz())
    local_end = local_start + timedelta(days=1)
    return local_start.astimezone(timezone.utc), local_end.astimezone(timezone.utc)


async def ensure_external_meeting_trigger_template(db: AsyncSession) -> SystemTaskTemplate:
    template = (
        await db.execute(
            select(SystemTaskTemplate).where(SystemTaskTemplate.trigger_type == EXTERNAL_MEETING_TRIGGER_TYPE)
        )
    ).scalar_one_or_none()
    if template is not None:
        return template

    template = SystemTaskTemplate(
        title=EXTERNAL_MEETING_TASK_TITLE,
        description=EXTERNAL_MEETING_TASK_DESCRIPTION,
        internal_notes=None,
        department_id=None,
        default_assignee_id=None,
        assignee_ids=[],
        scope=SystemTaskScope.ALL.value,
        frequency=FrequencyType.DAILY.value,
        day_of_week=None,
        days_of_week=None,
        day_of_month=None,
        month_of_year=None,
        timezone=settings.APP_TIMEZONE,
        due_time=EXTERNAL_MEETING_TASK_TIME,
        lookahead=1,
        interval=1,
        apply_from=None,
        duration_days=1,
        trigger_type=EXTERNAL_MEETING_TRIGGER_TYPE,
        priority=TaskPriority.NORMAL.value,
        finish_period=TaskFinishPeriod.AM.value,
        requires_alignment=False,
        alignment_time=None,
        is_active=False,
    )
    db.add(template)
    await db.flush()
    return template


async def _ensure_slot(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    user_id: uuid.UUID,
    next_run_at: datetime,
) -> SystemTaskTemplateAssigneeSlot:
    slot = (
        await db.execute(
            select(SystemTaskTemplateAssigneeSlot)
            .where(SystemTaskTemplateAssigneeSlot.template_id == template_id)
            .where(SystemTaskTemplateAssigneeSlot.primary_user_id == user_id)
        )
    ).scalar_one_or_none()
    if slot is not None:
        return slot

    slot = SystemTaskTemplateAssigneeSlot(
        id=uuid.uuid4(),
        template_id=template_id,
        primary_user_id=user_id,
        next_run_at=next_run_at,
        is_active=False,
    )
    db.add(slot)
    await db.flush()
    return slot


async def _fixed_assignee_ids(db: AsyncSession) -> list[uuid.UUID]:
    rows = (
        await db.execute(
            select(User.id, User.full_name)
            .where(User.full_name.in_(EXTERNAL_MEETING_ASSIGNEE_NAMES))
            .order_by(User.full_name.asc())
        )
    ).all()
    by_name = {str(full_name).strip().lower(): user_id for user_id, full_name in rows if full_name}
    return [
        by_name[name.lower()]
        for name in EXTERNAL_MEETING_ASSIGNEE_NAMES
        if name.lower() in by_name
    ]


async def _user_department_map(db: AsyncSession, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, uuid.UUID | None]:
    if not user_ids:
        return {}
    rows = (await db.execute(select(User.id, User.department_id).where(User.id.in_(user_ids)))).all()
    return {user_id: department_id for user_id, department_id in rows}


def _can_repurpose_existing_task(task: Task, occurrence_date: date, participant_ids: set[uuid.UUID]) -> bool:
    if task.status == TaskStatus.DONE:
        return False
    if task.assigned_to not in participant_ids:
        return False
    return task.meeting_occurrence_date != occurrence_date


async def reconcile_external_meeting_system_tasks_for_meeting(
    db: AsyncSession,
    meeting: Meeting,
    *,
    now_utc: datetime | None = None,
) -> int:
    now_utc = now_utc or datetime.now(timezone.utc)
    existing_tasks = (
        await db.execute(
            select(Task)
            .where(Task.meeting_origin_id == meeting.id)
            .where(Task.meeting_system_task_kind == EXTERNAL_MEETING_TASK_KIND)
            .order_by(Task.created_at.asc())
        )
    ).scalars().all()

    qualifies = is_one_time_external_meeting(meeting)
    occurrence_date = meeting_occurrence_date(meeting) if qualifies else None
    participant_ids = await _fixed_assignee_ids(db) if qualifies else []
    participant_id_set = set(participant_ids)

    if not qualifies or occurrence_date is None or not participant_ids:
        for task in existing_tasks:
            if task.status != TaskStatus.DONE:
                task.is_active = False
        return 0

    task_start_at = meeting_task_start_at(occurrence_date)
    template = await ensure_external_meeting_trigger_template(db)
    department_map = await _user_department_map(db, participant_ids)
    created_or_reactivated = 0

    current_tasks: dict[uuid.UUID, Task] = {}
    stale_reusable: dict[uuid.UUID, Task] = {}
    for task in existing_tasks:
        if task.assigned_to is None:
            if task.status != TaskStatus.DONE:
                task.is_active = False
            continue
        if (
            task.assigned_to in participant_id_set
            and task.meeting_occurrence_date == occurrence_date
        ):
            current_tasks[task.assigned_to] = task
            continue
        if _can_repurpose_existing_task(task, occurrence_date, participant_id_set):
            stale_reusable.setdefault(task.assigned_to, task)
            continue
        if task.status != TaskStatus.DONE:
            task.is_active = False

    for user_id in participant_ids:
        slot = await _ensure_slot(db, template_id=template.id, user_id=user_id, next_run_at=task_start_at)
        existing = current_tasks.get(user_id)
        if existing is None:
            existing = stale_reusable.get(user_id)
        if existing is not None and existing.status != TaskStatus.DONE:
            should_count = (
                not existing.is_active
                or existing.meeting_occurrence_date != occurrence_date
                or existing.origin_run_at != task_start_at
            )
            existing.title = EXTERNAL_MEETING_TASK_TITLE
            existing.description = EXTERNAL_MEETING_TASK_DESCRIPTION
            existing.department_id = department_map.get(user_id) or meeting.department_id
            existing.assigned_to = user_id
            existing.created_by = meeting.created_by or user_id
            existing.system_template_origin_id = template.id
            existing.system_task_slot_id = slot.id
            existing.origin_run_at = task_start_at
            existing.start_date = task_start_at
            existing.due_date = task_start_at
            existing.meeting_occurrence_date = occurrence_date
            existing.priority = TaskPriority.NORMAL.value
            existing.finish_period = TaskFinishPeriod.AM.value
            existing.is_active = True
            existing.completed_at = None
            if should_count:
                created_or_reactivated += 1
            await db.execute(
                pg_insert(TaskAssignee)
                .values({"task_id": existing.id, "user_id": user_id})
                .on_conflict_do_nothing(index_elements=["task_id", "user_id"])
            )
            continue

        task_id = uuid.uuid4()
        task_insert = pg_insert(Task).values(
            {
                "id": task_id,
                "title": EXTERNAL_MEETING_TASK_TITLE,
                "description": EXTERNAL_MEETING_TASK_DESCRIPTION,
                "internal_notes": None,
                "department_id": department_map.get(user_id) or meeting.department_id,
                "assigned_to": user_id,
                "created_by": meeting.created_by or user_id,
                "system_template_origin_id": template.id,
                "system_task_slot_id": slot.id,
                "origin_run_at": task_start_at,
                "start_date": task_start_at,
                "due_date": task_start_at,
                "meeting_origin_id": meeting.id,
                "meeting_occurrence_date": occurrence_date,
                "meeting_system_task_kind": EXTERNAL_MEETING_TASK_KIND,
                "status": TaskStatus.TODO.value,
                "priority": TaskPriority.NORMAL.value,
                "finish_period": TaskFinishPeriod.AM.value,
                "is_active": True,
                "created_at": now_utc,
                "updated_at": now_utc,
            }
        )
        task_insert = task_insert.on_conflict_do_nothing(
            index_elements=[
                "meeting_origin_id",
                "meeting_occurrence_date",
                "assigned_to",
                "meeting_system_task_kind",
            ],
            index_where=and_(
                Task.meeting_origin_id.is_not(None),
                Task.meeting_system_task_kind.is_not(None),
            ),
        ).returning(Task.id)
        inserted_task_id = (await db.execute(task_insert)).scalar_one_or_none()
        if inserted_task_id is None:
            continue
        await db.execute(
            pg_insert(TaskAssignee)
            .values({"task_id": inserted_task_id, "user_id": user_id})
            .on_conflict_do_nothing(index_elements=["task_id", "user_id"])
        )
        created_or_reactivated += 1

    return created_or_reactivated


async def deactivate_external_meeting_system_tasks(
    db: AsyncSession,
    meeting_id: uuid.UUID,
) -> int:
    tasks = (
        await db.execute(
            select(Task)
            .where(Task.meeting_origin_id == meeting_id)
            .where(Task.meeting_system_task_kind == EXTERNAL_MEETING_TASK_KIND)
        )
    ).scalars().all()
    changed = 0
    for task in tasks:
        if task.status == TaskStatus.DONE or not task.is_active:
            continue
        task.is_active = False
        changed += 1
    return changed


async def reconcile_external_meeting_system_tasks(
    db: AsyncSession,
    *,
    start: date | None = None,
    end: date | None = None,
    now_utc: datetime | None = None,
) -> int:
    now_utc = now_utc or datetime.now(timezone.utc)
    local_today = now_utc.astimezone(_app_tz()).date()
    start = start or local_today
    end = end or (local_today + timedelta(days=max(int(settings.SYSTEM_TASK_GENERATE_AHEAD_DAYS), 0)))
    if end < start:
        return 0

    start_utc, _ = _local_day_bounds_utc(start)
    _, end_utc = _local_day_bounds_utc(end)
    meetings = (
        await db.execute(
            select(Meeting)
            .where(Meeting.starts_at.is_not(None))
            .where(Meeting.starts_at >= start_utc)
            .where(Meeting.starts_at < end_utc)
            .where(Meeting.meeting_type == "external")
            .where(or_(Meeting.recurrence_type.is_(None), Meeting.recurrence_type == "", Meeting.recurrence_type == "none"))
        )
    ).scalars().all()

    changed = 0
    for meeting in meetings:
        changed += await reconcile_external_meeting_system_tasks_for_meeting(
            db,
            meeting,
            now_utc=now_utc,
        )
    return changed
