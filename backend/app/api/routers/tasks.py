from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, insert, select, cast, update, String as SQLString
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin, ensure_task_editor
from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import NotificationType, ProjectPhaseStatus, ProjectType, TaskPriority, TaskStatus, UserRole
from app.models.department import Department
from app.models.ga_note import GaNote
from app.models.notification import Notification
from app.models.project import Project
from app.models.project_planner_exclusion import ProjectPlannerExclusion
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.task_user_comment import TaskUserComment
from app.models.task_alignment_user import TaskAlignmentUser
from app.models.task_planner_exclusion import TaskPlannerExclusion
from app.models.task_daily_progress import TaskDailyProgress
from app.models.user import User
from app.schemas.task import TaskAssigneeOut, TaskCreate, TaskOut, TaskRemoveFromDayRequest, TaskUpdate
from pydantic import BaseModel
from app.services.audit import add_audit_log
from app.services.notifications import add_notification, publish_notification
from app.services.task_daily_progress import upsert_task_daily_progress
from app.services.task_classification import is_fast_task as is_fast_task_model, is_fast_task_fields


router = APIRouter()

MENTION_RE = re.compile(r"@([A-Za-z0-9_\\-\\.]{3,64})")
TOTAL_PRODUCTS_RE = re.compile(r"total_products[:=]\s*(\d+)", re.IGNORECASE)
COMPLETED_PRODUCTS_RE = re.compile(r"completed_products[:=]\s*(\d+)", re.IGNORECASE)

def _as_local_date(value: datetime | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo:
            tz = None
            if ZoneInfo is not None:
                try:
                    tz = ZoneInfo("Europe/Pristina")
                except Exception:
                    try:
                        tz = ZoneInfo("Europe/Belgrade")
                    except Exception:
                        tz = None
            if tz is None:
                try:
                    import pytz  # type: ignore[import-not-found]

                    try:
                        tz = pytz.timezone("Europe/Pristina")
                    except Exception:
                        tz = pytz.timezone("Europe/Belgrade")
                except ImportError:
                    tz = timezone(timedelta(hours=1))
            return value.astimezone(tz).date()
        return value.date()
    return value


def _is_mst_or_tt_project(project: Project) -> bool:
    title = (project.title or "").upper().strip()
    is_tt = title == "TT" or title.startswith("TT ") or title.startswith("TT-")
    return project.project_type == ProjectType.MST.value or ("MST" in title) or is_tt


def _extract_total_and_completed(daily_products: int | None, internal_notes: str | None) -> tuple[int | None, int]:
    total: int | None = daily_products
    completed = 0

    if internal_notes:
        if total is None:
            m_total = TOTAL_PRODUCTS_RE.search(internal_notes)
            if m_total:
                try:
                    total = int(m_total.group(1))
                except Exception:
                    total = None

        m_completed = COMPLETED_PRODUCTS_RE.search(internal_notes)
        if m_completed:
            try:
                completed = int(m_completed.group(1))
            except Exception:
                completed = 0

    if completed < 0:
        completed = 0
    if total is not None and total < 0:
        total = 0
    return total, completed


def _compute_status_from_completed(total: int | None, completed: int) -> TaskStatus | None:
    if total is None:
        return None
    if total <= 0:
        return TaskStatus.TODO
    if completed <= 0:
        return TaskStatus.TODO
    if completed < total:
        return TaskStatus.IN_PROGRESS
    return TaskStatus.DONE


def _user_to_assignee(user: User) -> TaskAssigneeOut:
    return TaskAssigneeOut(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
    )


async def _assignees_for_tasks(
    db: AsyncSession, task_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[TaskAssigneeOut]]:
    if not task_ids:
        return {}
    rows = (
        await db.execute(
            select(TaskAssignee.task_id, User)
            .join(User, TaskAssignee.user_id == User.id)
            .where(TaskAssignee.task_id.in_(task_ids))
            .order_by(User.full_name)
        )
    ).all()
    assignees: dict[uuid.UUID, list[TaskAssigneeOut]] = {task_id: [] for task_id in task_ids}
    for task_id, user in rows:
        assignees.setdefault(task_id, []).append(_user_to_assignee(user))
    return assignees


async def _assignees_for_fast_task_groups(
    db: AsyncSession, group_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[TaskAssigneeOut]]:
    """
    For fast tasks split into per-user copies, we still want TaskOut.assignees to
    show the full group membership (active copies only).
    """
    if not group_ids:
        return {}
    rows = (
        await db.execute(
            select(Task.fast_task_group_id, User)
            .join(TaskAssignee, TaskAssignee.task_id == Task.id)
            .join(User, TaskAssignee.user_id == User.id)
            .where(Task.fast_task_group_id.in_(group_ids))
            .where(Task.is_active.is_(True))
            .order_by(Task.fast_task_group_id, User.full_name)
        )
    ).all()
    out: dict[uuid.UUID, list[TaskAssigneeOut]] = {}
    seen: dict[uuid.UUID, set[uuid.UUID]] = {}
    for group_id, user in rows:
        if group_id is None:
            continue
        if group_id not in seen:
            seen[group_id] = set()
        if user.id in seen[group_id]:
            continue
        seen[group_id].add(user.id)
        out.setdefault(group_id, []).append(_user_to_assignee(user))
    return out


async def _replace_task_assignees(
    db: AsyncSession, task: Task, assignee_ids: list[uuid.UUID]
) -> None:
    await db.execute(delete(TaskAssignee).where(TaskAssignee.task_id == task.id))
    if assignee_ids:
        values = [{"task_id": task.id, "user_id": user_id} for user_id in assignee_ids]
        await db.execute(insert(TaskAssignee), values)


async def _user_comments_for_tasks(
    db: AsyncSession, task_ids: list[uuid.UUID], user_id: uuid.UUID
) -> dict[uuid.UUID, str | None]:
    if not task_ids:
        return {}
    rows = (
        await db.execute(
            select(TaskUserComment.task_id, TaskUserComment.comment)
            .where(TaskUserComment.task_id.in_(task_ids))
            .where(TaskUserComment.user_id == user_id)
        )
    ).all()
    return {task_id: comment for task_id, comment in rows}


def _task_to_out(
    task: Task,
    assignees: list[TaskAssigneeOut],
    user_comment: str | None = None,
    status_override: TaskStatus | None = None,
) -> TaskOut:
    return TaskOut(
        id=task.id,
        title=task.title,
        description=task.description,
        internal_notes=task.internal_notes,
        project_id=task.project_id,
        dependency_task_id=task.dependency_task_id,
        department_id=task.department_id,
        assigned_to=task.assigned_to,
        assignees=assignees,
        created_by=task.created_by,
        ga_note_origin_id=task.ga_note_origin_id,
        system_template_origin_id=task.system_template_origin_id,
        status=status_override or task.status,
        priority=task.priority,
        finish_period=task.finish_period,
        phase=task.phase,
        progress_percentage=task.progress_percentage,
        daily_products=task.daily_products,
        start_date=task.start_date,
        due_date=task.due_date,
        completed_at=task.completed_at,
        is_bllok=task.is_bllok,
        is_1h_report=task.is_1h_report,
        is_r1=task.is_r1,
        is_personal=task.is_personal,
        is_active=task.is_active,
        user_comment=user_comment,
        alignment_user_ids=None,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _enum_value(value) -> str | None:
    if value is None:
        return None
    return value.value if hasattr(value, "value") else value


async def _project_for_id(db: AsyncSession, project_id: uuid.UUID) -> Project:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


async def _users_by_usernames(db: AsyncSession, usernames: set[str]) -> list[User]:
    if not usernames:
        return []
    rows = (await db.execute(select(User).where(User.username.in_(sorted(usernames))))).scalars().all()
    return rows


def _extract_mentions(text: str | None) -> set[str]:
    if not text:
        return set()
    return set(MENTION_RE.findall(text))


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    department_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    status: TaskStatus | None = None,
    assigned_to: uuid.UUID | None = None,
    created_by: uuid.UUID | None = None,
    due_from: datetime | None = None,
    due_to: datetime | None = None,
    include_done: bool = True,
    include_all_departments: bool = False,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[TaskOut]:
    stmt = select(Task)
    project: Project | None = None
    is_mst_tt_project = False
    if project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
        if project is not None:
            is_mst_tt_project = _is_mst_or_tt_project(project)

    if project_id is None:
        # No role-based filtering for task visibility.
        pass

    if department_id:
        stmt = stmt.where(Task.department_id == department_id)
    if project_id:
        stmt = stmt.where(Task.project_id == project_id)
    if status:
        stmt = stmt.where(cast(Task.status, SQLString) == status.value)
    if assigned_to:
        # Check both Task.assigned_to and TaskAssignee table for multiple assignees
        task_ids_with_assignee = (
            await db.execute(
                select(TaskAssignee.task_id).where(TaskAssignee.user_id == assigned_to).distinct()
            )
        ).scalars().all()
        if task_ids_with_assignee:
            stmt = stmt.where(
                or_(
                    Task.assigned_to == assigned_to,
                    Task.id.in_(task_ids_with_assignee)
                )
            )
        else:
            stmt = stmt.where(Task.assigned_to == assigned_to)
    if created_by:
        stmt = stmt.where(Task.created_by == created_by)
    if due_from:
        stmt = stmt.where(Task.due_date >= due_from)
    if due_to:
        stmt = stmt.where(Task.due_date <= due_to)
    if not include_done:
        stmt = stmt.where(cast(Task.status, SQLString) != TaskStatus.DONE.value)

    tasks = (await db.execute(stmt.order_by(Task.created_at))).scalars().all()
    task_ids = [t.id for t in tasks]
    assignee_map = await _assignees_for_tasks(db, task_ids)
    fallback_ids = [
        t.assigned_to
        for t in tasks
        if t.assigned_to is not None and not assignee_map.get(t.id)
    ]
    if fallback_ids:
        fallback_users = (
            await db.execute(select(User).where(User.id.in_(fallback_ids)))
        ).scalars().all()
        fallback_map = {user.id: user for user in fallback_users}
        for t in tasks:
            if assignee_map.get(t.id):
                continue
            if t.assigned_to in fallback_map:
                assignee_map[t.id] = [_user_to_assignee(fallback_map[t.assigned_to])]

    # Fetch alignment users for returned tasks
    alignment_map: dict[uuid.UUID, list[uuid.UUID]] = {}
    if task_ids:
        rows = (
            await db.execute(
                select(TaskAlignmentUser.task_id, TaskAlignmentUser.user_id)
                .where(TaskAlignmentUser.task_id.in_(task_ids))
            )
        ).all()
        for tid, uid in rows:
            alignment_map.setdefault(tid, []).append(uid)

    out = []
    for t in tasks:
        status_override: TaskStatus | None = None
        if is_mst_tt_project and t.phase in (ProjectPhaseStatus.PRODUCT.value, ProjectPhaseStatus.CONTROL.value):
            total, completed = _extract_total_and_completed(t.daily_products, t.internal_notes)
            status_override = _compute_status_from_completed(total, completed)
        # Important: for list views we keep task-local assignees (TaskAssignee rows).
        # Fast-task "group" membership is shown in the task details endpoint instead.
        # Otherwise each per-user copy would appear assigned to everyone in the group,
        # which breaks "My view" filtering and per-user status display.
        dto_assignees = assignee_map.get(t.id, [])
        dto = _task_to_out(t, dto_assignees or [], status_override=status_override)
        dto.alignment_user_ids = alignment_map.get(t.id)
        out.append(dto)
    return out


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskOut:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    # For viewing, only check department access - editing is restricted separately
    # GA managers can view tasks across departments
    ga_manager_cross = (
        user.role == UserRole.MANAGER
        and getattr(user, "department", None) is not None
        and getattr(user.department, "code", "") is not None
        and user.department.code.upper() == "GA"
    )
    can_view = False
    if task.project_id is None and task.dependency_task_id is None and task.system_template_origin_id is None:
        can_view = True
    if ga_manager_cross:
        can_view = True
    if task.created_by and task.created_by == user.id:
        can_view = True
    if task.assigned_to and task.assigned_to == user.id:
        can_view = True
    if not can_view:
        assigned_row = (
            await db.execute(
                select(TaskAssignee)
                .where(TaskAssignee.task_id == task.id)
                .where(TaskAssignee.user_id == user.id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if assigned_row is not None:
            can_view = True
    if not can_view:
        ensure_department_access(user, task.department_id)
    assignee_map = await _assignees_for_tasks(db, [task.id])
    if not assignee_map.get(task.id) and task.assigned_to is not None:
        assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
        if assigned_user is not None:
            assignee_map[task.id] = [_user_to_assignee(assigned_user)]
    dto_assignees = assignee_map.get(task.id, [])
    if task.fast_task_group_id is not None and is_fast_task_model(task):
        group_map = await _assignees_for_fast_task_groups(db, [task.fast_task_group_id])
        dto_assignees = group_map.get(task.fast_task_group_id, dto_assignees)
    status_override: TaskStatus | None = None
    if task.project_id is not None and task.phase in (
        ProjectPhaseStatus.PRODUCT.value,
        ProjectPhaseStatus.CONTROL.value,
    ):
        project = (await db.execute(select(Project).where(Project.id == task.project_id))).scalar_one_or_none()
        if project is not None and _is_mst_or_tt_project(project):
            total, completed = _extract_total_and_completed(task.daily_products, task.internal_notes)
            status_override = _compute_status_from_completed(total, completed)

    dto = _task_to_out(task, dto_assignees or [], status_override=status_override)
    rows = (
        await db.execute(
            select(TaskAlignmentUser.user_id).where(TaskAlignmentUser.task_id == task.id)
        )
    ).scalars().all()
    dto.alignment_user_ids = list(rows) if rows else None
    return dto


@router.post("", response_model=TaskOut)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskOut:
    # ensures_manager_or_admin(user) - Removed to allow all department members to create tasks
    department_id = payload.department_id
    dependency_task_id = payload.dependency_task_id
    is_fast = is_fast_task_fields(
        title=payload.title,
        project_id=payload.project_id,
        dependency_task_id=dependency_task_id,
        system_template_origin_id=None,
        ga_note_origin_id=payload.ga_note_origin_id,
    )
    project = None
    if payload.project_id is not None:
        project = await _project_for_id(db, payload.project_id)
        if project.department_id is not None and project.department_id != department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project department mismatch")

    # Allow GA managers (department code GA) to create tasks for any department (for fast tasks etc.)
    if department_id is not None and payload.ga_note_origin_id is None:
        ga_manager_cross = (
            user.role == UserRole.MANAGER
            and getattr(user, "department", None) is not None
            and getattr(user.department, "code", "") is not None
            and user.department.code.upper() == "GA"
        )
        if not ga_manager_cross and not is_fast:
            ensure_department_access(user, department_id)

    if dependency_task_id is not None:
        if payload.project_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependency requires a project")
        dependency_task = (
            await db.execute(select(Task).where(Task.id == dependency_task_id))
        ).scalar_one_or_none()
        if dependency_task is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependency task not found")
        if dependency_task.project_id != payload.project_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependency must be in the same project")
        task.dependency_task_id = payload.dependency_task_id

    if payload.ga_note_origin_id is not None:
        ga_note = (
            await db.execute(select(GaNote).where(GaNote.id == payload.ga_note_origin_id))
        ).scalar_one_or_none()
        if ga_note is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GA note not found")
        if ga_note.project_id is not None:
            ga_project = (
                await db.execute(select(Project).where(Project.id == ga_note.project_id))
            ).scalar_one_or_none()
            if ga_project is not None and ga_project.department_id is not None:
                ga_project_department = (
                    await db.execute(select(Department).where(Department.id == ga_project.department_id))
                ).scalar_one_or_none()
                if ga_project_department is not None:
                    code = (ga_project_department.code or "").upper()
                    if code in ("PCM", "GDS"):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Tasks for PCM/GDS projects must be created manually",
                        )
        # Allow cross-department task creation from GA notes - removed department mismatch check
        # if ga_note.department_id is not None and ga_note.department_id != department_id:
        #     raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GA note department mismatch")
        if ga_note.project_id is not None and ga_note.project_id != payload.project_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GA note project mismatch")

        if payload.due_date is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Due date is required for GA/KA note tasks",
            )

    assignee_ids: list[uuid.UUID] | None = None
    assignee_users: list[User] = []
    # Allow cross-department for projects, GA notes, or fast tasks (tasks without project_id)
    allow_cross_department = project is not None or payload.ga_note_origin_id is not None or payload.project_id is None
    if payload.assignees is not None:
        seen: set[uuid.UUID] = set()
        assignee_ids = [uid for uid in payload.assignees if not (uid in seen or seen.add(uid))]
    elif payload.assigned_to is not None:
        assignee_ids = [payload.assigned_to]

    if assignee_ids is not None:
        assignee_users = (
            await db.execute(select(User).where(User.id.in_(assignee_ids)))
        ).scalars().all()
        if len(assignee_users) != len(assignee_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
        for assignee in assignee_users:
            if not allow_cross_department and assignee.department_id != department_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")

    assignee_dept_map: dict[uuid.UUID, uuid.UUID | None] = {
        user.id: user.department_id for user in assignee_users
    }

    status_value = payload.status or TaskStatus.TODO
    priority_value = payload.priority or TaskPriority.NORMAL
    phase_value = payload.phase or (project.current_phase if project else ProjectPhaseStatus.MEETINGS)

    if project is not None and _is_mst_or_tt_project(project) and phase_value in (
        ProjectPhaseStatus.PRODUCT,
        ProjectPhaseStatus.CONTROL,
    ):
        total, completed = _extract_total_and_completed(payload.daily_products, payload.internal_notes)
        auto_status = _compute_status_from_completed(total, completed)
        if auto_status is not None:
            status_value = auto_status

    completed_at = payload.completed_at
    if status_value == TaskStatus.DONE:
        completed_at = completed_at or datetime.now(timezone.utc)
    else:
        completed_at = None

    start_date_value = payload.start_date or datetime.now(timezone.utc)
    due_date_value = payload.due_date

    # Development project multi-assignee: create per-assignee copies.
    if project is not None and assignee_ids is not None and len(assignee_ids) > 1:
        project_department = None
        if project.department_id is not None:
            project_department = (
                await db.execute(select(Department).where(Department.id == project.department_id))
            ).scalar_one_or_none()
        is_development = False
        if project_department is not None:
            dept_name = (project_department.name or "").strip().upper()
            dept_code = (project_department.code or "").strip().upper()
            if dept_name == "DEVELOPMENT" or dept_code == "DEV":
                is_development = True

        if is_development:
            created_tasks: list[Task] = []
            created_notifications: list[Notification] = []

            ordered_assignee_ids = list(assignee_ids)
            if payload.assigned_to in ordered_assignee_ids:
                ordered_assignee_ids.remove(payload.assigned_to)  # type: ignore[arg-type]
                ordered_assignee_ids.insert(0, payload.assigned_to)  # type: ignore[arg-type]

            for assignee_id in ordered_assignee_ids:
                task_department_id = assignee_dept_map.get(assignee_id) or project.department_id
                t = Task(
                    title=payload.title,
                    description=payload.description,
                    internal_notes=payload.internal_notes,
                    project_id=payload.project_id,
                    dependency_task_id=dependency_task_id,
                    department_id=task_department_id,
                    assigned_to=assignee_id,
                    created_by=user.id,
                    ga_note_origin_id=payload.ga_note_origin_id,
                    fast_task_group_id=None,
                    status=status_value,
                    priority=priority_value,
                    finish_period=payload.finish_period,
                    phase=phase_value,
                    progress_percentage=payload.progress_percentage or 0,
                    daily_products=payload.daily_products,
                    start_date=start_date_value,
                    due_date=due_date_value,
                    completed_at=completed_at,
                    is_bllok=payload.is_bllok or False,
                    is_1h_report=payload.is_1h_report or False,
                    is_r1=payload.is_r1 or False,
                    is_personal=payload.is_personal or False,
                )
                db.add(t)
                await db.flush()
                await _replace_task_assignees(db, t, [assignee_id])

                if payload.alignment_user_ids:
                    seen_align: set[uuid.UUID] = set()
                    ids = [uid for uid in payload.alignment_user_ids if not (uid in seen_align or seen_align.add(uid))]
                    await db.execute(
                        insert(TaskAlignmentUser),
                        [{"task_id": t.id, "user_id": uid} for uid in ids],
                    )

                planned_day = _as_local_date(t.due_date)
                if planned_day is not None:
                    finish_period = (str(t.finish_period).strip().upper() if t.finish_period else "")
                    if finish_period in ("AM", "PM"):
                        slots_to_clear = {finish_period, "ALL"}
                    else:
                        slots_to_clear = {"AM", "PM", "ALL"}
                    await db.execute(
                        delete(ProjectPlannerExclusion).where(
                            ProjectPlannerExclusion.project_id == t.project_id,
                            ProjectPlannerExclusion.user_id == assignee_id,
                            ProjectPlannerExclusion.day_date == planned_day,
                            ProjectPlannerExclusion.time_slot.in_(sorted(slots_to_clear)),
                        )
                    )

                created_tasks.append(t)
                created_notifications.append(
                    add_notification(
                        db=db,
                        user_id=assignee_id,
                        type=NotificationType.assignment,
                        title="Task assigned",
                        body=t.title,
                        data={"task_id": str(t.id)},
                    )
                )

                add_audit_log(
                    db=db,
                    actor_user_id=user.id,
                    entity_type="task",
                    entity_id=t.id,
                    action="created",
                    before=None,
                    after={
                        "title": t.title,
                        "status": _enum_value(t.status),
                        "assigned_to": str(t.assigned_to) if t.assigned_to else None,
                    },
                )

            await db.commit()

            for n in created_notifications:
                try:
                    await publish_notification(user_id=n.user_id, notification=n)
                except Exception:
                    pass

            first = created_tasks[0]
            await db.refresh(first)
            assignee_map = await _assignees_for_tasks(db, [first.id])
            dto_assignees = assignee_map.get(first.id, [])
            dto = _task_to_out(first, dto_assignees or [])
            dto.alignment_user_ids = payload.alignment_user_ids
            return dto

    # MST Graphic Design cross-department project tasks: create per-assignee copies.
    if project is not None and assignee_ids is not None and len(assignee_ids) > 1:
        title_upper = (project.title or "").upper().strip()
        is_tt = title_upper == "TT" or title_upper.startswith("TT ") or title_upper.startswith("TT-")
        is_mst = project.project_type == ProjectType.MST.value or ("MST" in title_upper)
        if is_mst and not is_tt:
            project_department = None
            if project.department_id is not None:
                project_department = (
                    await db.execute(select(Department).where(Department.id == project.department_id))
                ).scalar_one_or_none()
            is_graphic_design = False
            if project_department is not None:
                dept_name = (project_department.name or "").strip().upper()
                dept_code = (project_department.code or "").strip().upper()
                if dept_name == "GRAPHIC DESIGN" or dept_code in ("GD", "GDS"):
                    is_graphic_design = True

            if is_graphic_design:
                normalized_dept_ids: set[uuid.UUID | None] = set()
                for assignee_id in assignee_ids:
                    normalized_dept_ids.add(assignee_dept_map.get(assignee_id) or project.department_id)
                unique_dept_ids = {dept_id for dept_id in normalized_dept_ids if dept_id is not None}

                if len(unique_dept_ids) > 1:
                    created_tasks: list[Task] = []
                    created_notifications: list[Notification] = []

                    ordered_assignee_ids = list(assignee_ids)
                    if payload.assigned_to in ordered_assignee_ids:
                        ordered_assignee_ids.remove(payload.assigned_to)  # type: ignore[arg-type]
                        ordered_assignee_ids.insert(0, payload.assigned_to)  # type: ignore[arg-type]

                    for assignee_id in ordered_assignee_ids:
                        task_department_id = assignee_dept_map.get(assignee_id) or project.department_id
                        t = Task(
                            title=payload.title,
                            description=payload.description,
                            internal_notes=payload.internal_notes,
                            project_id=payload.project_id,
                            dependency_task_id=dependency_task_id,
                            department_id=task_department_id,
                            assigned_to=assignee_id,
                            created_by=user.id,
                            ga_note_origin_id=payload.ga_note_origin_id,
                            fast_task_group_id=None,
                            status=status_value,
                            priority=priority_value,
                            finish_period=payload.finish_period,
                            phase=phase_value,
                            progress_percentage=payload.progress_percentage or 0,
                            daily_products=payload.daily_products,
                            start_date=start_date_value,
                            due_date=due_date_value,
                            completed_at=completed_at,
                            is_bllok=payload.is_bllok or False,
                            is_1h_report=payload.is_1h_report or False,
                            is_r1=payload.is_r1 or False,
                            is_personal=payload.is_personal or False,
                        )
                        db.add(t)
                        await db.flush()
                        await _replace_task_assignees(db, t, [assignee_id])

                        if payload.alignment_user_ids:
                            seen_align: set[uuid.UUID] = set()
                            ids = [uid for uid in payload.alignment_user_ids if not (uid in seen_align or seen_align.add(uid))]
                            await db.execute(
                                insert(TaskAlignmentUser),
                                [{"task_id": t.id, "user_id": uid} for uid in ids],
                            )

                        # Clear weekly planner exclusions so the task is visible for this assignee.
                        planned_day = _as_local_date(t.due_date)
                        if planned_day is not None:
                            finish_period = (str(t.finish_period).strip().upper() if t.finish_period else "")
                            if finish_period in ("AM", "PM"):
                                slots_to_clear = {finish_period, "ALL"}
                            else:
                                slots_to_clear = {"AM", "PM", "ALL"}
                            await db.execute(
                                delete(ProjectPlannerExclusion).where(
                                    ProjectPlannerExclusion.project_id == t.project_id,
                                    ProjectPlannerExclusion.user_id == assignee_id,
                                    ProjectPlannerExclusion.day_date == planned_day,
                                    ProjectPlannerExclusion.time_slot.in_(sorted(slots_to_clear)),
                                )
                            )

                        created_tasks.append(t)
                        created_notifications.append(
                            add_notification(
                                db=db,
                                user_id=assignee_id,
                                type=NotificationType.assignment,
                                title="Task assigned",
                                body=t.title,
                                data={"task_id": str(t.id)},
                            )
                        )

                        add_audit_log(
                            db=db,
                            actor_user_id=user.id,
                            entity_type="task",
                            entity_id=t.id,
                            action="created",
                            before=None,
                            after={
                                "title": t.title,
                                "status": _enum_value(t.status),
                                "assigned_to": str(t.assigned_to) if t.assigned_to else None,
                            },
                        )

                    await db.commit()

                    for n in created_notifications:
                        try:
                            await publish_notification(user_id=n.user_id, notification=n)
                        except Exception:
                            pass

                    first = created_tasks[0]
                    await db.refresh(first)
                    assignee_map = await _assignees_for_tasks(db, [first.id])
                    dto_assignees = assignee_map.get(first.id, [])
                    dto = _task_to_out(first, dto_assignees or [])
                    dto.alignment_user_ids = payload.alignment_user_ids
                    return dto

    # GA note standalone multi-assignee: create per-user copies (no fast_task_group_id).
    if (
        payload.ga_note_origin_id is not None
        and payload.project_id is None
        and is_fast
        and assignee_ids is not None
        and len(assignee_ids) > 1
    ):
        created_tasks: list[Task] = []
        created_notifications: list[Notification] = []

        ordered_assignee_ids = list(assignee_ids)
        if payload.assigned_to in ordered_assignee_ids:
            ordered_assignee_ids.remove(payload.assigned_to)  # type: ignore[arg-type]
            ordered_assignee_ids.insert(0, payload.assigned_to)  # type: ignore[arg-type]

        for assignee_id in ordered_assignee_ids:
            task_department_id = assignee_dept_map.get(assignee_id) or department_id
            t = Task(
                title=payload.title,
                description=payload.description,
                internal_notes=payload.internal_notes,
                project_id=payload.project_id,
                dependency_task_id=dependency_task_id,
                department_id=task_department_id,
                assigned_to=assignee_id,
                created_by=user.id,
                ga_note_origin_id=payload.ga_note_origin_id,
                fast_task_group_id=None,
                status=status_value,
                priority=priority_value,
                finish_period=payload.finish_period,
                phase=phase_value,
                progress_percentage=payload.progress_percentage or 0,
                daily_products=payload.daily_products,
                start_date=start_date_value,
                due_date=due_date_value,
                completed_at=completed_at,
                is_bllok=payload.is_bllok or False,
                is_1h_report=payload.is_1h_report or False,
                is_r1=payload.is_r1 or False,
                is_personal=payload.is_personal or False,
            )
            db.add(t)
            await db.flush()
            await _replace_task_assignees(db, t, [assignee_id])

            if payload.alignment_user_ids:
                seen_align: set[uuid.UUID] = set()
                ids = [uid for uid in payload.alignment_user_ids if not (uid in seen_align or seen_align.add(uid))]
                await db.execute(
                    insert(TaskAlignmentUser),
                    [{"task_id": t.id, "user_id": uid} for uid in ids],
                )

            created_tasks.append(t)
            created_notifications.append(
                add_notification(
                    db=db,
                    user_id=assignee_id,
                    type=NotificationType.assignment,
                    title="Task assigned",
                    body=t.title,
                    data={"task_id": str(t.id)},
                )
            )

            add_audit_log(
                db=db,
                actor_user_id=user.id,
                entity_type="task",
                entity_id=t.id,
                action="created",
                before=None,
                after={
                    "title": t.title,
                    "status": _enum_value(t.status),
                    "assigned_to": str(t.assigned_to) if t.assigned_to else None,
                },
            )

        await db.commit()

        for n in created_notifications:
            try:
                await publish_notification(user_id=n.user_id, notification=n)
            except Exception:
                pass

        first = created_tasks[0]
        await db.refresh(first)
        assignee_map = await _assignees_for_tasks(db, [first.id])
        dto_assignees = assignee_map.get(first.id, [])
        dto = _task_to_out(first, dto_assignees or [])
        dto.alignment_user_ids = payload.alignment_user_ids
        return dto

    # Standalone task multi-assignee: create per-user copies tied by fast_task_group_id.
    if is_fast and assignee_ids is not None and len(assignee_ids) > 1:
        fast_task_group_id = uuid.uuid4()
        created_tasks: list[Task] = []
        created_notifications: list[Notification] = []

        # Keep deterministic ordering: prefer payload.assigned_to first if provided.
        ordered_assignee_ids = list(assignee_ids)
        if payload.assigned_to in ordered_assignee_ids:
            ordered_assignee_ids.remove(payload.assigned_to)  # type: ignore[arg-type]
            ordered_assignee_ids.insert(0, payload.assigned_to)  # type: ignore[arg-type]

        for assignee_id in ordered_assignee_ids:
            task_department_id = assignee_dept_map.get(assignee_id) or department_id
            t = Task(
                title=payload.title,
                description=payload.description,
                internal_notes=payload.internal_notes,
                project_id=payload.project_id,
                dependency_task_id=dependency_task_id,
                department_id=task_department_id,
                assigned_to=assignee_id,
                created_by=user.id,
                ga_note_origin_id=payload.ga_note_origin_id,
                fast_task_group_id=fast_task_group_id,
                status=status_value,
                priority=priority_value,
                finish_period=payload.finish_period,
                phase=phase_value,
                progress_percentage=payload.progress_percentage or 0,
                daily_products=payload.daily_products,
                start_date=start_date_value,
                due_date=due_date_value,
                completed_at=completed_at,
                is_bllok=payload.is_bllok or False,
                is_1h_report=payload.is_1h_report or False,
                is_r1=payload.is_r1 or False,
                is_personal=payload.is_personal or False,
            )
            db.add(t)
            await db.flush()
            await _replace_task_assignees(db, t, [assignee_id])

            # Optional: store alignment users for this task (fast-task alignment).
            if payload.alignment_user_ids:
                seen_align: set[uuid.UUID] = set()
                ids = [uid for uid in payload.alignment_user_ids if not (uid in seen_align or seen_align.add(uid))]
                await db.execute(
                    insert(TaskAlignmentUser),
                    [{"task_id": t.id, "user_id": uid} for uid in ids],
                )

            created_tasks.append(t)
            created_notifications.append(
                add_notification(
                    db=db,
                    user_id=assignee_id,
                    type=NotificationType.assignment,
                    title="Task assigned",
                    body=t.title,
                    data={"task_id": str(t.id)},
                )
            )

            add_audit_log(
                db=db,
                actor_user_id=user.id,
                entity_type="task",
                entity_id=t.id,
                action="created",
                before=None,
                after={
                    "title": t.title,
                    "status": _enum_value(t.status),
                    "assigned_to": str(t.assigned_to) if t.assigned_to else None,
                },
            )

        await db.commit()

        for n in created_notifications:
            try:
                await publish_notification(user_id=n.user_id, notification=n)
            except Exception:
                pass

        # Return the first created task; clients typically refetch lists.
        first = created_tasks[0]
        await db.refresh(first)
        group_assignees = await _assignees_for_fast_task_groups(db, [fast_task_group_id])
        dto = _task_to_out(first, group_assignees.get(fast_task_group_id, []))
        dto.alignment_user_ids = payload.alignment_user_ids
        return dto

    fast_task_group_id = uuid.uuid4() if is_fast else None

    assigned_to_value = assignee_ids[0] if assignee_ids else None
    task_department_id = department_id
    if is_fast and assigned_to_value is not None:
        task_department_id = assignee_dept_map.get(assigned_to_value) or department_id

    task = Task(
        title=payload.title,
        description=payload.description,
        internal_notes=payload.internal_notes,
        project_id=payload.project_id,
        dependency_task_id=dependency_task_id,
        department_id=task_department_id,
        assigned_to=assigned_to_value,
        created_by=user.id,
        ga_note_origin_id=payload.ga_note_origin_id,
        fast_task_group_id=fast_task_group_id,
        status=status_value,
        priority=priority_value,
        finish_period=payload.finish_period,
        phase=phase_value,
        progress_percentage=payload.progress_percentage or 0,
        daily_products=payload.daily_products,
        start_date=start_date_value,
        due_date=due_date_value,
        completed_at=completed_at,
        is_bllok=payload.is_bllok or False,
        is_1h_report=payload.is_1h_report or False,
        is_r1=payload.is_r1 or False,
        is_personal=payload.is_personal or False,
    )
    db.add(task)
    await db.flush()

    # Record per-day progress event for MST/TT Product Content tasks based on completed/total.
    # This is per-day history; it does not retroactively change other days.
    if project is not None and _is_mst_or_tt_project(project) and phase_value in (
        ProjectPhaseStatus.PRODUCT,
        ProjectPhaseStatus.CONTROL,
    ):
        total, completed = _extract_total_and_completed(task.daily_products, task.internal_notes)
        if total is not None and total > 0 and completed > 0:
            today = datetime.now(timezone.utc).date()
            await upsert_task_daily_progress(
                db,
                task_id=task.id,
                day_date=today,
                old_completed=0,
                new_completed=completed,
                total=total,
            )

    # Optional: store alignment users for this task (fast-task alignment).
    if payload.alignment_user_ids:
        seen: set[uuid.UUID] = set()
        ids = [uid for uid in payload.alignment_user_ids if not (uid in seen or seen.add(uid))]
        await db.execute(
            insert(TaskAlignmentUser),
            [{"task_id": task.id, "user_id": uid} for uid in ids],
        )
    if assignee_ids is not None:
        await _replace_task_assignees(db, task, assignee_ids)
        if assignee_ids == [] and task.system_template_origin_id and task.department_id is not None:
            task.is_active = False

    # If this is a project task, and the project was previously removed from the weekly planner
    # for this user/day/slot, auto-clear that exclusion so the newly created task is visible.
    if task.project_id is not None and assignee_ids:
        planned_day = _as_local_date(task.due_date)
        if planned_day is not None:
            finish_period = (str(task.finish_period).strip().upper() if task.finish_period else "")
            if finish_period in ("AM", "PM"):
                slots_to_clear = {finish_period, "ALL"}
            else:
                # Unknown/empty -> shows in both slots in weekly table, so clear both + ALL.
                slots_to_clear = {"AM", "PM", "ALL"}
            await db.execute(
                delete(ProjectPlannerExclusion).where(
                    ProjectPlannerExclusion.project_id == task.project_id,
                    ProjectPlannerExclusion.user_id.in_(assignee_ids),
                    ProjectPlannerExclusion.day_date == planned_day,
                    ProjectPlannerExclusion.time_slot.in_(sorted(slots_to_clear)),
                )
            )

    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="task",
        entity_id=task.id,
        action="created",
        before=None,
        after={
            "title": task.title,
            "status": _enum_value(task.status),
            "assigned_to": str(task.assigned_to) if task.assigned_to else None,
        },
    )

    created_notifications: list[Notification] = []
    existing_assignee_ids: set[uuid.UUID] = set()
    if payload.assignees is not None or payload.assigned_to is not None:
        rows = (
            await db.execute(
                select(TaskAssignee.user_id).where(TaskAssignee.task_id == task.id)
            )
        ).scalars().all()
        existing_assignee_ids = set(rows)
    for assignee in assignee_users:
        created_notifications.append(
            add_notification(
                db=db,
                user_id=assignee.id,
                type=NotificationType.assignment,
                title="Task assigned",
                body=task.title,
                data={"task_id": str(task.id)},
            )
        )

    mentions = _extract_mentions(task.title) | _extract_mentions(task.description)
    if mentions:
        mentioned_users = await _users_by_usernames(db, mentions)
        for mu in mentioned_users:
            if mu.id == user.id:
                continue
            created_notifications.append(
                add_notification(
                    db=db,
                    user_id=mu.id,
                    type=NotificationType.mention,
                    title="Mentioned in task",
                    body=task.title,
                    data={"task_id": str(task.id)},
                )
            )

    await db.commit()

    for n in created_notifications:
        try:
            await publish_notification(user_id=n.user_id, notification=n)
        except Exception:
            pass

    await db.refresh(task)
    assignee_map = await _assignees_for_tasks(db, [task.id])
    if not assignee_map.get(task.id) and task.assigned_to is not None:
        assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
        if assigned_user is not None:
            assignee_map[task.id] = [_user_to_assignee(assigned_user)]
    dto_assignees = assignee_map.get(task.id, [])
    if task.fast_task_group_id is not None and is_fast_task_model(task):
        group_map = await _assignees_for_fast_task_groups(db, [task.fast_task_group_id])
        dto_assignees = group_map.get(task.fast_task_group_id, dto_assignees)
    dto = _task_to_out(task, dto_assignees or [])
    dto.alignment_user_ids = payload.alignment_user_ids
    return dto


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskOut:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    
    # Check if user has permission to edit this task:
    # Allow: Admin, Manager, task creator, primary assignee, or any assignee in TaskAssignee table
    can_edit = False
    if user.role in (UserRole.ADMIN, UserRole.MANAGER):
        can_edit = True
    elif task.created_by and task.created_by == user.id:
        can_edit = True
    elif task.assigned_to and task.assigned_to == user.id:
        can_edit = True
    else:
        # Check if user is in the TaskAssignee table for this task
        assignee_record = (
            await db.execute(
                select(TaskAssignee)
                .where(TaskAssignee.task_id == task.id, TaskAssignee.user_id == user.id)
            )
        ).scalar_one_or_none()
        if assignee_record is not None:
            can_edit = True
    
    if not can_edit:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    
    # For system task status updates, allow admins and managers to bypass department check
    is_system_task_status_update = (
        task.system_template_origin_id is not None
        and payload.status is not None
        and user.role in (UserRole.ADMIN, UserRole.MANAGER)
    )
    # Department access check removed since can_edit above already verified
    # that user is admin, manager, creator, or assignee

    if payload.status is not None and task.system_template_origin_id is not None:
        if task.assigned_to == user.id:
            pass
        elif user.role in (UserRole.ADMIN, UserRole.MANAGER):
            # Allow admins and managers to update system task status
            pass
        else:
            status_assignment = (
                await db.execute(
                    select(TaskAssignee)
                    .where(TaskAssignee.task_id == task.id, TaskAssignee.user_id == user.id)
                )
            ).scalar_one_or_none()
            if status_assignment is None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Forbidden fields check removed to allow staff full update access

    before = {
        "title": task.title,
        "description": task.description,
        "internal_notes": task.internal_notes,
        "dependency_task_id": str(task.dependency_task_id) if task.dependency_task_id else None,
        "status": _enum_value(task.status),
        "priority": _enum_value(task.priority),
        "finish_period": _enum_value(task.finish_period),
        "phase": _enum_value(task.phase),
        "assigned_to": str(task.assigned_to) if task.assigned_to else None,
        "progress_percentage": task.progress_percentage,
        "due_date": task.due_date.isoformat() if task.due_date else None,
    }

    # Snapshot completion values before update for MST/TT daily progress logging.
    old_total, old_completed = _extract_total_and_completed(task.daily_products, task.internal_notes)

    # Track if status was explicitly set in payload to prevent auto-status from overriding it
    status_was_explicitly_set = payload.status is not None

    created_notifications: list[Notification] = []
    assignee_users: list[User] = []
    # Allow cross-department for projects, GA notes, or fast tasks (tasks without project_id)
    # This matches the logic in create_task endpoint
    allow_cross_department = task.project_id is not None or task.ga_note_origin_id is not None or task.project_id is None

    # Fast tasks are stored as per-user copies tied by fast_task_group_id.
    # For older rows, initialize the group id lazily on first update.
    if is_fast_task_model(task) and task.fast_task_group_id is None:
        task.fast_task_group_id = task.id
    is_fast_group_task = task.fast_task_group_id is not None and is_fast_task_model(task)
    fast_group_desired_assignee_ids: list[uuid.UUID] | None = None

    if payload.title is not None:
        task.title = payload.title
    if payload.description is not None:
        task.description = payload.description
    if payload.internal_notes is not None:
        task.internal_notes = payload.internal_notes
    dependency_set = False
    if hasattr(payload, "model_fields_set"):
        dependency_set = "dependency_task_id" in payload.model_fields_set  # type: ignore[attr-defined]
    elif hasattr(payload, "__fields_set__"):
        dependency_set = "dependency_task_id" in payload.__fields_set__  # type: ignore[attr-defined]

    if dependency_set:
        ensure_manager_or_admin(user)
        if payload.dependency_task_id is None:
            task.dependency_task_id = None
        else:
            dependency_task = (
                await db.execute(select(Task).where(Task.id == payload.dependency_task_id))
            ).scalar_one_or_none()
            if dependency_task is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependency task not found")
            if task.project_id is None or dependency_task.project_id != task.project_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependency must be in the same project")
            task.dependency_task_id = payload.dependency_task_id

    if payload.project_id is not None:
        ensure_manager_or_admin(user)
        project = await _project_for_id(db, payload.project_id)
        if task.department_id != project.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project department mismatch")
        task.project_id = payload.project_id

    if payload.department_id is not None and payload.department_id != task.department_id:
        ensure_manager_or_admin(user)
        ensure_department_access(user, payload.department_id)
        task.department_id = payload.department_id

    if payload.assignees is not None:
        # Fast task group: assignees represent group membership; don't mutate task.assigned_to.
        if is_fast_group_task:
            seen: set[uuid.UUID] = set()
            fast_group_desired_assignee_ids = [
                uid for uid in payload.assignees if not (uid in seen or seen.add(uid))
            ]
            assignee_users = (
                await db.execute(select(User).where(User.id.in_(fast_group_desired_assignee_ids)))
            ).scalars().all()
            if len(assignee_users) != len(fast_group_desired_assignee_ids):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
            for assignee in assignee_users:
                if not allow_cross_department and assignee.department_id != task.department_id:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")
        else:
            # Non-fast tasks: keep existing multi-assignee behavior (single task row).
            rows = (
                await db.execute(
                    select(TaskAssignee.user_id).where(TaskAssignee.task_id == task.id)
                )
            ).scalars().all()
            existing_assignee_ids = set(rows)
            seen: set[uuid.UUID] = set()
            assignee_ids = [uid for uid in payload.assignees if not (uid in seen or seen.add(uid))]
            assignee_users = (
                await db.execute(select(User).where(User.id.in_(assignee_ids)))
            ).scalars().all()
            if len(assignee_users) != len(assignee_ids):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
            for assignee in assignee_users:
                if not allow_cross_department and assignee.department_id != task.department_id:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")
            await _replace_task_assignees(db, task, assignee_ids)
            task.assigned_to = assignee_ids[0] if assignee_ids else None
            if assignee_ids == [] and task.system_template_origin_id and task.department_id is not None:
                task.is_active = False
            new_ids = set(assignee_ids) - existing_assignee_ids
            for assignee in assignee_users:
                if assignee.id not in new_ids:
                    continue
                created_notifications.append(
                    add_notification(
                        db=db,
                        user_id=assignee.id,
                        type=NotificationType.assignment,
                        title="Task assigned",
                        body=task.title,
                        data={"task_id": str(task.id)},
                    )
                )
    elif payload.assigned_to is not None and payload.assigned_to != task.assigned_to and not is_fast_group_task:
        # Allow task editors (creator, assignee, manager, admin) to change assignee
        # ensure_manager_or_admin check removed - can_edit already verified permission
        assigned_user = (await db.execute(select(User).where(User.id == payload.assigned_to))).scalar_one_or_none()
        if assigned_user is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
        if not allow_cross_department and assigned_user.department_id != task.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")
        task.assigned_to = payload.assigned_to
        await _replace_task_assignees(db, task, [payload.assigned_to])
        assignee_users = [assigned_user]
        created_notifications.append(
            add_notification(
                db=db,
                user_id=assigned_user.id,
                type=NotificationType.assignment,
                title="Task assigned",
                body=task.title,
                data={"task_id": str(task.id)},
            )
        )

    if payload.status is not None and payload.status != task.status:
        old_status = task.status
        task.status = payload.status
        if task.status == TaskStatus.DONE:
            task.completed_at = task.completed_at or datetime.now(timezone.utc)
        else:
            task.completed_at = None
        
        # Update TaskDailyProgress for MST/TT tasks when status changes
        # This ensures the color (yellow/green) only appears on the day status changed
        # Use "today" (the day status is being changed) instead of due_date
        if task.project_id is not None and task.phase in (
            ProjectPhaseStatus.PRODUCT.value,
            ProjectPhaseStatus.CONTROL.value,
        ):
            project = (await db.execute(select(Project).where(Project.id == task.project_id))).scalar_one_or_none()
            if project is not None and _is_mst_or_tt_project(project):
                # Use today (the day status is being changed) instead of due_date
                today = datetime.now(timezone.utc).date()
                
                # Get or create TaskDailyProgress for today
                existing_progress = (
                    await db.execute(
                        select(TaskDailyProgress).where(
                            TaskDailyProgress.task_id == task.id,
                            TaskDailyProgress.day_date == today,
                        )
                    )
                ).scalar_one_or_none()
                
                if existing_progress is None:
                    # Create new entry with explicit status
                    total, completed = _extract_total_and_completed(task.daily_products, task.internal_notes)
                    db.add(
                        TaskDailyProgress(
                            task_id=task.id,
                            day_date=today,
                            completed_value=completed or 0,
                            total_value=total or 0,
                            completed_delta=0,
                            daily_status=task.status.value,
                        )
                    )
                else:
                    # Update existing entry's daily_status based on status change
                    # If status is DONE, always set to DONE
                    if task.status == TaskStatus.DONE:
                        existing_progress.daily_status = TaskStatus.DONE.value
                    elif task.status == TaskStatus.IN_PROGRESS:
                        # Only set to IN_PROGRESS if it was TODO before
                        # This ensures we don't override a DONE status from a previous day
                        if old_status == TaskStatus.TODO:
                            existing_progress.daily_status = TaskStatus.IN_PROGRESS.value
                        # If it was already IN_PROGRESS or DONE, keep the current daily_status
                    # If status is TODO, don't change daily_status (keep existing or default to TODO)
    
    if payload.is_personal is not None:
        task.is_personal = payload.is_personal
    # Optional: update alignment users if provided
    alignment_set = False
    if hasattr(payload, "model_fields_set"):
        alignment_set = "alignment_user_ids" in payload.model_fields_set  # type: ignore[attr-defined]
    elif hasattr(payload, "__fields_set__"):
        alignment_set = "alignment_user_ids" in payload.__fields_set__  # type: ignore[attr-defined]
    if alignment_set:
        await db.execute(delete(TaskAlignmentUser).where(TaskAlignmentUser.task_id == task.id))
        if payload.alignment_user_ids:
            seen: set[uuid.UUID] = set()
            ids = [uid for uid in payload.alignment_user_ids if not (uid in seen or seen.add(uid))]
            await db.execute(
                insert(TaskAlignmentUser),
                [{"task_id": task.id, "user_id": uid} for uid in ids],
            )

    if payload.priority is not None:
        task.priority = payload.priority
    if payload.finish_period is not None:
        task.finish_period = payload.finish_period
    if payload.phase is not None:
        # Allow task editors to change phase (removed manager/admin restriction)
        task.phase = payload.phase
    if payload.progress_percentage is not None:
        task.progress_percentage = payload.progress_percentage
    if payload.daily_products is not None:
        task.daily_products = payload.daily_products
    if payload.start_date is not None:
        task.start_date = payload.start_date
    if payload.due_date is not None:
        # If due_date is being changed (postponed), preserve the original planned date once.
        if task.due_date is not None and payload.due_date != task.due_date and task.original_due_date is None:
            task.original_due_date = task.due_date
        task.due_date = payload.due_date
    if payload.completed_at is not None:
        task.completed_at = payload.completed_at
    if payload.is_bllok is not None:
        task.is_bllok = payload.is_bllok
    if payload.is_1h_report is not None:
        task.is_1h_report = payload.is_1h_report
    if payload.is_r1 is not None:
        task.is_r1 = payload.is_r1

    # Validate fast task type flags are mutually exclusive (only for fast tasks)
    # Fast tasks: no project_id, no system_template_origin_id
    if task.project_id is None and task.system_template_origin_id is None:
        # Get the final flag values after applying payload updates
        final_is_bllok = payload.is_bllok if payload.is_bllok is not None else task.is_bllok
        final_is_r1 = payload.is_r1 if payload.is_r1 is not None else task.is_r1
        final_is_1h_report = payload.is_1h_report if payload.is_1h_report is not None else task.is_1h_report
        final_is_personal = payload.is_personal if payload.is_personal is not None else task.is_personal
        
        # Count how many type flags are set (GA type uses ga_note_origin_id, not a boolean flag)
        active_flags_count = sum([
            final_is_bllok,
            final_is_r1,
            final_is_1h_report,
            final_is_personal,
        ])
        
        if active_flags_count > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Fast task can only have one type: BLL, R1, 1H, or Personal"
            )

    # Auto-status for MST/TT Product Content tasks: compute status from completed/total products.
    # Only auto-compute status if status wasn't explicitly set by user
    if task.project_id is not None and task.phase in (
        ProjectPhaseStatus.PRODUCT.value,
        ProjectPhaseStatus.CONTROL.value,
    ):
        project = (await db.execute(select(Project).where(Project.id == task.project_id))).scalar_one_or_none()
        if project is not None and _is_mst_or_tt_project(project):
            total, completed = _extract_total_and_completed(task.daily_products, task.internal_notes)
            
            # Only auto-compute status if status wasn't explicitly set in payload
            # This preserves user's explicit status changes
            if not status_was_explicitly_set:
                auto_status = _compute_status_from_completed(total, completed)
                if auto_status is not None:
                    task.status = auto_status
                    if task.status == TaskStatus.DONE:
                        task.completed_at = task.completed_at or datetime.now(timezone.utc)
                    else:
                        task.completed_at = None

            # Per-day progress logging: touches the record for the task's due_date (today/past only).
            # If due_date is in the future, skip logging; if due_date is None, fall back to today.
            if total is not None and total > 0:
                made_progress = completed > old_completed
                became_done_today = completed >= total and old_completed < total
                is_already_done = completed >= total
                values_changed = completed != old_completed or total != old_total
                # Update if there's progress, just became done, is already done, or values changed (to keep status accurate).
                if made_progress or became_done_today or is_already_done or values_changed:
                    today = datetime.now(timezone.utc).date()
                    progress_day: date | None = today
                    if task.due_date is not None:
                        due_dt = task.due_date
                        due_day = due_dt.astimezone(timezone.utc).date() if due_dt.tzinfo else due_dt.date()
                        if due_day > today:
                            progress_day = None
                        else:
                            progress_day = due_day

                    if progress_day is not None:
                        # Check if there's an existing TaskDailyProgress for today with explicit status
                        # If status was explicitly set today, preserve it
                        explicit_status_for_today: TaskStatus | None = None
                        if status_was_explicitly_set and progress_day == today:
                            # Check if we just set a status for today in the status change block above
                            existing_today_progress = (
                                await db.execute(
                                    select(TaskDailyProgress).where(
                                        TaskDailyProgress.task_id == task.id,
                                        TaskDailyProgress.day_date == today,
                                    )
                                )
                            ).scalar_one_or_none()
                            if existing_today_progress and existing_today_progress.daily_status in (
                                TaskStatus.IN_PROGRESS.value,
                                TaskStatus.DONE.value,
                            ):
                                # Preserve the explicit status that was set today
                                explicit_status_for_today = TaskStatus(existing_today_progress.daily_status)
                        
                        await upsert_task_daily_progress(
                            db,
                            task_id=task.id,
                            day_date=progress_day,
                            old_completed=old_completed,
                            new_completed=completed,
                            total=total,
                            explicit_status=explicit_status_for_today,
                        )

    if payload.status is not None and task.assigned_to is not None and task.status == payload.status:
        created_notifications.append(
            add_notification(
                db=db,
                user_id=task.assigned_to,
                type=NotificationType.status_change,
                title="Task status changed",
                body=task.title,
                data={"task_id": str(task.id), "status": _enum_value(task.status)},
            )
        )

    mentions = _extract_mentions(payload.title) | _extract_mentions(payload.description)
    if mentions:
        mentioned_users = await _users_by_usernames(db, mentions)
        for mu in mentioned_users:
            if mu.id == user.id:
                continue
            created_notifications.append(
                add_notification(
                    db=db,
                    user_id=mu.id,
                    type=NotificationType.mention,
                    title="Mentioned in task",
                    body=task.title,
                    data={"task_id": str(task.id)},
                )
            )

    # Fast task group behavior:
    # - shared edits propagate to all active copies (status remains per-user)
    # - assignees updates manage group membership (add copies / deactivate removed)
    if is_fast_group_task and task.fast_task_group_id is not None:
        shared_values: dict[str, object] = {}
        if payload.title is not None:
            shared_values["title"] = task.title
        if payload.description is not None:
            shared_values["description"] = task.description
        if payload.internal_notes is not None:
            shared_values["internal_notes"] = task.internal_notes
        if payload.department_id is not None:
            shared_values["department_id"] = task.department_id
        if payload.due_date is not None:
            shared_values["due_date"] = task.due_date
        if payload.start_date is not None:
            shared_values["start_date"] = task.start_date
        if payload.priority is not None:
            shared_values["priority"] = task.priority
        if payload.finish_period is not None:
            shared_values["finish_period"] = task.finish_period
        if payload.phase is not None:
            shared_values["phase"] = task.phase
        if payload.progress_percentage is not None:
            shared_values["progress_percentage"] = task.progress_percentage
        if payload.daily_products is not None:
            shared_values["daily_products"] = task.daily_products
        if payload.is_bllok is not None:
            shared_values["is_bllok"] = task.is_bllok
        if payload.is_r1 is not None:
            shared_values["is_r1"] = task.is_r1
        if payload.is_1h_report is not None:
            shared_values["is_1h_report"] = task.is_1h_report
        if payload.is_personal is not None:
            shared_values["is_personal"] = task.is_personal

        if shared_values:
            await db.execute(
                update(Task)
                .where(Task.fast_task_group_id == task.fast_task_group_id)
                .where(Task.id != task.id)
                .where(Task.is_active.is_(True))
                .values(**shared_values)
            )

        if fast_group_desired_assignee_ids is not None:
            group_rows = (
                await db.execute(
                    select(Task.id, Task.assigned_to)
                    .where(Task.fast_task_group_id == task.fast_task_group_id)
                    .where(Task.is_active.is_(True))
                )
            ).all()
            current_user_ids = {uid for _, uid in group_rows if uid is not None}
            desired_user_ids = set(fast_group_desired_assignee_ids)

            to_add = sorted(desired_user_ids - current_user_ids)
            to_remove = current_user_ids - desired_user_ids

            if to_remove:
                remove_task_ids = [tid for tid, uid in group_rows if uid in to_remove]
                if remove_task_ids:
                    await db.execute(update(Task).where(Task.id.in_(remove_task_ids)).values(is_active=False))
                    await db.execute(delete(TaskAssignee).where(TaskAssignee.task_id.in_(remove_task_ids)))
                    if task.id in remove_task_ids:
                        task.is_active = False

            if to_add:
                # Use the current task's alignment users as the group default for new copies.
                alignment_user_ids = (
                    await db.execute(
                        select(TaskAlignmentUser.user_id).where(TaskAlignmentUser.task_id == task.id)
                    )
                ).scalars().all()

                # Validate added users exist and department rules.
                add_users = (
                    await db.execute(select(User).where(User.id.in_(to_add)))
                ).scalars().all()
                if len(add_users) != len(to_add):
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
                for au in add_users:
                    if not allow_cross_department and au.department_id != task.department_id:
                        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")

                for au in add_users:
                    new_task = Task(
                        title=task.title,
                        description=task.description,
                        internal_notes=task.internal_notes,
                        project_id=task.project_id,
                        dependency_task_id=task.dependency_task_id,
                        department_id=task.department_id,
                        assigned_to=au.id,
                        created_by=task.created_by,
                        ga_note_origin_id=task.ga_note_origin_id,
                        system_template_origin_id=task.system_template_origin_id,
                        fast_task_group_id=task.fast_task_group_id,
                        status=TaskStatus.TODO,
                        priority=task.priority,
                        finish_period=task.finish_period,
                        phase=task.phase,
                        progress_percentage=task.progress_percentage,
                        daily_products=task.daily_products,
                        start_date=task.start_date,
                        due_date=task.due_date,
                        original_due_date=task.original_due_date,
                        completed_at=None,
                        is_bllok=task.is_bllok,
                        is_1h_report=task.is_1h_report,
                        is_r1=task.is_r1,
                        is_personal=task.is_personal,
                        is_active=True,
                    )
                    db.add(new_task)
                    await db.flush()
                    await _replace_task_assignees(db, new_task, [au.id])

                    if alignment_user_ids:
                        await db.execute(
                            insert(TaskAlignmentUser),
                            [{"task_id": new_task.id, "user_id": uid} for uid in alignment_user_ids],
                        )

                    created_notifications.append(
                        add_notification(
                            db=db,
                            user_id=au.id,
                            type=NotificationType.assignment,
                            title="Task assigned",
                            body=new_task.title,
                            data={"task_id": str(new_task.id)},
                        )
                    )

    after = {
        "title": task.title,
        "description": task.description,
        "internal_notes": task.internal_notes,
        "dependency_task_id": str(task.dependency_task_id) if task.dependency_task_id else None,
        "status": _enum_value(task.status),
        "priority": _enum_value(task.priority),
        "finish_period": _enum_value(task.finish_period),
        "phase": _enum_value(task.phase),
        "assigned_to": str(task.assigned_to) if task.assigned_to else None,
        "progress_percentage": task.progress_percentage,
        "due_date": task.due_date.isoformat() if task.due_date else None,
    }

    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="task",
        entity_id=task.id,
        action="updated",
        before=before,
        after=after,
    )

    await db.commit()

    for n in created_notifications:
        try:
            await publish_notification(user_id=n.user_id, notification=n)
        except Exception:
            pass

    await db.refresh(task)
    assignee_map = await _assignees_for_tasks(db, [task.id])
    if not assignee_map.get(task.id) and task.assigned_to is not None:
        assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
        if assigned_user is not None:
            assignee_map[task.id] = [_user_to_assignee(assigned_user)]
    dto_assignees = assignee_map.get(task.id, [])
    if task.fast_task_group_id is not None and is_fast_task_model(task):
        group_map = await _assignees_for_fast_task_groups(db, [task.fast_task_group_id])
        dto_assignees = group_map.get(task.fast_task_group_id, dto_assignees)
    dto = _task_to_out(task, dto_assignees or [])
    if alignment_set:
        dto.alignment_user_ids = payload.alignment_user_ids
    else:
        rows = (
            await db.execute(select(TaskAlignmentUser.user_id).where(TaskAlignmentUser.task_id == task.id))
        ).scalars().all()
        dto.alignment_user_ids = list(rows) if rows else None
    return dto


@router.post("/{task_id}/deactivate", response_model=TaskOut)
async def deactivate_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskOut:
    ensure_manager_or_admin(user)
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    ensure_department_access(user, task.department_id)
    task.is_active = False
    await db.commit()
    await db.refresh(task)
    assignee_map = await _assignees_for_tasks(db, [task.id])
    if not assignee_map.get(task.id) and task.assigned_to is not None:
        assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
        if assigned_user is not None:
            assignee_map[task.id] = [_user_to_assignee(assigned_user)]
    return _task_to_out(task, assignee_map.get(task.id, []))


class TaskCommentUpdate(BaseModel):
    comment: str | None = None


@router.patch("/{task_id}/comment", response_model=TaskOut)
async def update_task_user_comment(
    task_id: uuid.UUID,
    payload: TaskCommentUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskOut:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    
    # Check if user is assigned to the task
    is_assigned = (
        task.assigned_to == user.id
        or (await db.execute(
            select(TaskAssignee).where(
                TaskAssignee.task_id == task_id,
                TaskAssignee.user_id == user.id
            )
        )).scalar_one_or_none() is not None
    )
    if not is_assigned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only comment on tasks assigned to you")
    
    # Get or create user comment
    user_comment = (
        await db.execute(
            select(TaskUserComment).where(
                TaskUserComment.task_id == task_id,
                TaskUserComment.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    
    if user_comment is None:
        user_comment = TaskUserComment(
            task_id=task_id,
            user_id=user.id,
            comment=payload.comment,
        )
        db.add(user_comment)
    else:
        user_comment.comment = payload.comment
    
    await db.commit()
    await db.refresh(task)
    assignee_map = await _assignees_for_tasks(db, [task.id])
    if not assignee_map.get(task.id) and task.assigned_to is not None:
        assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
        if assigned_user is not None:
            assignee_map[task.id] = [_user_to_assignee(assigned_user)]
    comment_map = await _user_comments_for_tasks(db, [task.id], user.id)
    return _task_to_out(task, assignee_map.get(task.id, []), comment_map.get(task.id))


@router.post("/{task_id}/remove-from-day", response_model=None)
async def remove_task_from_day(
    task_id: uuid.UUID,
    payload: TaskRemoveFromDayRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Remove a task instance for a specific user/day/slot without touching the master task."""
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    
    if task.department_id is not None:
        ensure_department_access(current_user, task.department_id)
    
    # Only managers and admins can remove tasks from days
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers and admins can remove tasks from days")
    
    slot = (payload.time_slot or "ALL").strip().upper()
    if slot not in ("AM", "PM", "ALL"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid time slot")

    existing = (
        await db.execute(
            select(TaskPlannerExclusion).where(
                TaskPlannerExclusion.task_id == task.id,
                TaskPlannerExclusion.user_id == payload.user_id,
                TaskPlannerExclusion.day_date == payload.day_date,
                TaskPlannerExclusion.time_slot == slot,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    exclusion = TaskPlannerExclusion(
        task_id=task.id,
        user_id=payload.user_id,
        day_date=payload.day_date,
        time_slot=slot,
        created_by=current_user.id,
    )
    db.add(exclusion)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> Response:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    if task.department_id is not None:
        ensure_department_access(user, task.department_id)
    # Only managers and admins can delete tasks
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers and admins can delete tasks")

    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="task",
        entity_id=task.id,
        action="deleted",
        before={
            "title": task.title,
            "status": _enum_value(task.status),
            "assigned_to": str(task.assigned_to) if task.assigned_to else None,
        },
    )

    # Fast task groups: "delete only for me" -> soft-delete only this copy.
    if task.fast_task_group_id is not None and is_fast_task_model(task):
        task.is_active = False
        await db.execute(delete(TaskAssignee).where(TaskAssignee.task_id == task.id))
        await db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # Explicitly delete related records to avoid SQLAlchemy relationship synchronization issues
    # Since TaskAssignee has a composite primary key, SQLAlchemy can't "blank out" the foreign key
    await db.execute(delete(TaskAssignee).where(TaskAssignee.task_id == task.id))
    await db.execute(delete(TaskAlignmentUser).where(TaskAlignmentUser.task_id == task.id))
    await db.execute(delete(TaskUserComment).where(TaskUserComment.task_id == task.id))
    
    # Flush to ensure deletes are processed
    await db.flush()
    
    # Expire the assignees relationship to prevent SQLAlchemy from trying to synchronize it
    db.expire(task, ["assignees"])
    
    # Now delete the task - database CASCADE will handle other related records
    await db.delete(task)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
