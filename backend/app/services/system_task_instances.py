from __future__ import annotations

import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import and_, insert, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.common_entry import CommonEntry
from app.models.enums import CommonApprovalStatus, CommonCategory, TaskPriority, TaskStatus
from app.models.system_task_template import SystemTaskTemplate
from app.models.system_task_template_assignee_slot import SystemTaskTemplateAssigneeSlot
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.services.system_task_schedule import first_run_at, next_occurrence, template_due_time, template_tz


def _safe_iso_date(value: str | None, fallback: date) -> date:
    if not value:
        return fallback
    try:
        return date.fromisoformat(value)
    except ValueError:
        return fallback


def _parse_annual_leave(entry: CommonEntry) -> tuple[date, date, bool]:
    note = entry.description or ""
    base_date = entry.entry_date or entry.created_at.date()
    start_date = base_date
    end_date = base_date
    is_all_users = "[ALL_USERS]" in note

    date_range_match = re.search(r"Date range:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})", note, re.I)
    if date_range_match:
        start_date = _safe_iso_date(date_range_match.group(1), start_date)
        end_date = _safe_iso_date(date_range_match.group(2), end_date)
        return start_date, end_date, is_all_users

    date_match = re.search(r"Date:\s*(\d{4}-\d{2}-\d{2})", note, re.I)
    if date_match:
        parsed = _safe_iso_date(date_match.group(1), start_date)
        return parsed, parsed, is_all_users

    date_matches = re.findall(r"\d{4}-\d{2}-\d{2}", note)
    if date_matches:
        start_date = _safe_iso_date(date_matches[0], start_date)
        end_date = _safe_iso_date(date_matches[1] if len(date_matches) > 1 else date_matches[0], end_date)
    return start_date, end_date, is_all_users


def _overlaps(start_a: date, end_a: date, start_b: date, end_b: date) -> bool:
    return start_a <= end_b and start_b <= end_a


async def _is_user_absent(
    db: AsyncSession,
    user_id: uuid.UUID,
    start_local_date: date,
    end_local_date: date,
) -> bool:
    stmt = (
        select(CommonEntry)
        .where(
            CommonEntry.approval_status == CommonApprovalStatus.approved,
            CommonEntry.category.in_([CommonCategory.absences, CommonCategory.annual_leave]),
            or_(
                CommonEntry.assigned_to_user_id == user_id,
                and_(CommonEntry.assigned_to_user_id.is_(None), CommonEntry.created_by_user_id == user_id),
            ),
            or_(
                CommonEntry.entry_date.is_(None),
                CommonEntry.entry_date >= start_local_date - timedelta(days=365),
            ),
        )
    )
    entries = (await db.execute(stmt)).scalars().all()
    for entry in entries:
        entry_date = entry.entry_date or entry.created_at.date()
        if entry.category == CommonCategory.absences:
            if _overlaps(entry_date, entry_date, start_local_date, end_local_date):
                return True
            continue
        leave_start, leave_end, is_all_users = _parse_annual_leave(entry)
        if is_all_users or _overlaps(leave_start, leave_end, start_local_date, end_local_date):
            return True
    return False


async def resolve_assignee(
    db: AsyncSession,
    *,
    primary: uuid.UUID,
    zv1: uuid.UUID | None,
    zv2: uuid.UUID | None,
    task_start_date: date,
    task_due_date: date,
) -> uuid.UUID:
    if not await _is_user_absent(db, primary, task_start_date, task_due_date):
        return primary
    if zv1 and not await _is_user_absent(db, zv1, task_start_date, task_due_date):
        return zv1
    if zv2:
        return zv2
    return primary


def _adjust_due_datetime_local(
    *,
    tz: ZoneInfo,
    due_time: time,
    start_local_dt: datetime,
    duration_days: int,
) -> datetime:
    due_day = start_local_dt.date() + timedelta(days=max(duration_days, 1) - 1)
    due_dt = datetime.combine(due_day, due_time, tzinfo=tz)
    # Weekend policy: move due date to previous Friday.
    while due_dt.weekday() > 4:
        due_dt = due_dt - timedelta(days=1)
    return due_dt


async def _assignee_department(db: AsyncSession, assignee_id: uuid.UUID) -> uuid.UUID | None:
    user = (await db.execute(select(User).where(User.id == assignee_id))).scalar_one_or_none()
    return user.department_id if user else None


async def generate_system_task_instances(
    db: AsyncSession,
    now_utc: datetime | None = None,
    lookahead_days_override: int | None = None,
) -> int:
    now_utc = now_utc or datetime.now(timezone.utc)
    max_lookahead_days = max(lookahead_days_override or 0, 0)
    if max_lookahead_days == 0:
        max_lookahead_days = (
            await db.execute(select(SystemTaskTemplate.lookahead).where(SystemTaskTemplate.is_active.is_(True)))
        ).scalars().all()
        max_lookahead_days = max([int(v or 14) for v in max_lookahead_days], default=14)
    global_lookahead = now_utc + timedelta(days=max_lookahead_days)

    slot_rows = (
        await db.execute(
            select(SystemTaskTemplateAssigneeSlot, SystemTaskTemplate)
            .join(SystemTaskTemplate, SystemTaskTemplateAssigneeSlot.template_id == SystemTaskTemplate.id)
            .where(SystemTaskTemplateAssigneeSlot.is_active.is_(True))
            .where(SystemTaskTemplate.is_active.is_(True))
            .where(SystemTaskTemplateAssigneeSlot.next_run_at <= global_lookahead)
            .with_for_update(skip_locked=True)
        )
    ).all()
    if not slot_rows:
        return 0

    created = 0
    for slot, template in slot_rows:
        tz = template_tz(template)
        due_time = template_due_time(template)
        template_lookahead = int(getattr(template, "lookahead", 14) or 14)
        if lookahead_days_override is not None:
            template_lookahead = int(lookahead_days_override)
        lookahead_end_utc = now_utc + timedelta(days=max(1, template_lookahead))
        next_run = slot.next_run_at

        while next_run <= lookahead_end_utc:
            origin_run_at = next_run
            origin_local = origin_run_at.astimezone(tz)
            due_local = _adjust_due_datetime_local(
                tz=tz,
                due_time=due_time,
                start_local_dt=origin_local,
                duration_days=int(getattr(template, "duration_days", 1) or 1),
            )
            due_utc = due_local.astimezone(timezone.utc)
            assignee_id = await resolve_assignee(
                db,
                primary=slot.primary_user_id,
                zv1=slot.zv1_user_id,
                zv2=slot.zv2_user_id,
                task_start_date=origin_local.date(),
                task_due_date=due_local.date(),
            )
            department_id = await _assignee_department(db, assignee_id) or template.department_id
            task_id = uuid.uuid4()
            task_insert = pg_insert(Task).values(
                {
                    "id": task_id,
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
                # Keep duplicate-key collisions isolated so the outer transaction stays usable.
                async with db.begin_nested():
                    inserted_task_id = (await db.execute(task_insert)).scalar_one_or_none()
            except IntegrityError as exc:
                # Environments may enforce a second uniqueness rule:
                # (system_template_origin_id, assigned_to, immutable_date(start_date)).
                # Treat that collision as idempotent generation.
                msg = str(exc).lower()
                if "duplicate key value violates unique constraint" in msg and (
                    "immutable_date(start_date)" in msg
                    or "uq_tasks_system_template_user_date" in msg
                ):
                    inserted_task_id = None
                else:
                    raise
            if inserted_task_id:
                await db.execute(
                    pg_insert(TaskAssignee)
                    .values({"task_id": inserted_task_id, "user_id": assignee_id})
                    .on_conflict_do_nothing(index_elements=["task_id", "user_id"])
                )
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
    if end < start:
        return 0
    days = (end - start).days + 1
    now_utc = datetime.now(timezone.utc)
    return await generate_system_task_instances(db=db, now_utc=now_utc, lookahead_days_override=days + 1)


def _app_zoneinfo() -> ZoneInfo:
    try:
        return ZoneInfo(settings.APP_TIMEZONE)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


async def ensure_due_today_instances_best_effort(
    db: AsyncSession,
    *,
    now_utc: datetime | None = None,
) -> int:
    now_utc = now_utc or datetime.now(timezone.utc)
    due_slot_id = (
        await db.execute(
            select(SystemTaskTemplateAssigneeSlot.id)
            .join(SystemTaskTemplate, SystemTaskTemplateAssigneeSlot.template_id == SystemTaskTemplate.id)
            .where(SystemTaskTemplateAssigneeSlot.is_active.is_(True))
            .where(SystemTaskTemplate.is_active.is_(True))
            .where(SystemTaskTemplateAssigneeSlot.next_run_at <= now_utc)
            .limit(1)
        )
    ).scalar_one_or_none()
    if due_slot_id is None:
        return 0

    await ensure_slots_initialized(db)
    today_local = now_utc.astimezone(_app_zoneinfo()).date()
    created = await ensure_task_instances_in_range(db=db, start=today_local, end=today_local)
    await db.commit()
    return created


async def ensure_slots_initialized(db: AsyncSession) -> None:
    templates = (
        await db.execute(select(SystemTaskTemplate).where(SystemTaskTemplate.is_active.is_(True)))
    ).scalars().all()
    if not templates:
        return

    template_ids = [template.id for template in templates]
    existing_slot_template_ids = set(
        (
            await db.execute(
                select(SystemTaskTemplateAssigneeSlot.template_id).where(
                    SystemTaskTemplateAssigneeSlot.template_id.in_(template_ids)
                )
            )
        ).scalars().all()
    )
    now_utc = datetime.now(timezone.utc)
    pending_values: list[dict] = []

    for template in templates:
        if template.id in existing_slot_template_ids:
            continue
        assignee_ids = list(getattr(template, "assignee_ids", None) or [])
        if not assignee_ids and template.default_assignee_id:
            assignee_ids = [template.default_assignee_id]
        if not assignee_ids:
            continue
        next_run = first_run_at(template, now_utc)
        pending_values.extend(
            [
                {
                    "id": uuid.uuid4(),
                    "template_id": template.id,
                    "primary_user_id": assignee_id,
                    "zv1_user_id": None,
                    "zv2_user_id": None,
                    "next_run_at": next_run,
                    "is_active": True,
                    "created_at": now_utc,
                    "updated_at": now_utc,
                }
                for assignee_id in assignee_ids
            ]
        )

    if pending_values:
        await db.execute(insert(SystemTaskTemplateAssigneeSlot), pending_values)


async def reconcile_system_task_slots(
    db: AsyncSession,
    *,
    now_utc: datetime | None = None,
    lookback_days: int = 30,
) -> dict[str, int]:
    now_utc = now_utc or datetime.now(timezone.utc)
    lookback_days = max(int(lookback_days or 0), 0)

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
        return {"rewound_slots": 0, "created_tasks": 0}

    rewound_slots = 0
    for slot, template in slot_rows:
        tz = template_tz(template)
        today_local = now_utc.astimezone(tz).date()
        start_local = today_local - timedelta(days=lookback_days)

        if start_local > today_local:
            continue

        start_utc = datetime.combine(start_local, time.min, tzinfo=tz).astimezone(timezone.utc)
        end_utc = datetime.combine(today_local + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)

        existing_run_rows = (
            await db.execute(
                select(Task.origin_run_at)
                .where(Task.system_template_origin_id == template.id)
                .where(Task.system_task_slot_id == slot.id)
                .where(Task.origin_run_at.is_not(None))
                .where(Task.origin_run_at >= start_utc)
                .where(Task.origin_run_at < end_utc)
            )
        ).scalars().all()
        existing_dates = {run_at.astimezone(tz).date() for run_at in existing_run_rows if run_at is not None}

        cursor = first_run_at(template, start_utc)
        earliest_missing_run: datetime | None = None
        for _ in range((lookback_days + 2) * 8):
            cursor_local_date = cursor.astimezone(tz).date()
            if cursor_local_date > today_local:
                break
            if cursor_local_date not in existing_dates:
                earliest_missing_run = cursor
                break
            cursor = next_occurrence(template, cursor)

        if earliest_missing_run is not None and slot.next_run_at > earliest_missing_run:
            slot.next_run_at = earliest_missing_run
            rewound_slots += 1

    created_tasks = 0
    if rewound_slots > 0:
        created_tasks = await generate_system_task_instances(
            db=db,
            now_utc=now_utc,
            lookahead_days_override=lookback_days + 1,
        )

    return {"rewound_slots": rewound_slots, "created_tasks": created_tasks}
