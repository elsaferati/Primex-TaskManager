from __future__ import annotations

import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:
    # Fallback for Python < 3.9
    try:
        import pytz
        ZoneInfo = None  # Will use pytz instead
    except ImportError:
        ZoneInfo = None

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import ProjectPhaseStatus, ProjectType, TaskFinishPeriod, TaskPriority, TaskStatus, UserRole
from app.models.project import Project
from app.models.project_planner_exclusion import ProjectPlannerExclusion
from app.models.project_member import ProjectMember
from app.models.system_task_template import SystemTaskTemplate
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.task_planner_exclusion import TaskPlannerExclusion
from app.models.task_daily_progress import TaskDailyProgress
from app.models.user import User
from app.models.weekly_plan import WeeklyPlan
from app.models.weekly_planner_legend_entry import WeeklyPlannerLegendEntry
from app.models.department import Department
from app.services.system_task_schedule import matches_template_date
from app.schemas.planner import (
    MonthlyPlannerResponse,
    MonthlyPlannerSummary,
    WeeklyPlannerDay,
    WeeklyPlannerLegendEntryOut,
    WeeklyPlannerLegendEntryUpdate,
    WeeklyPlannerProject,
    WeeklyPlannerResponse,
    WeeklyTableDay,
    WeeklyTableDepartment,
    WeeklyTableProjectEntry,
    WeeklyTableProjectTaskEntry,
    WeeklyTableResponse,
    WeeklyTableTaskEntry,
    WeeklyTableUserDay,
)
from app.schemas.project import ProjectOut
from app.schemas.task import TaskAssigneeOut, TaskOut
from app.schemas.weekly_plan import WeeklyPlanCreate, WeeklyPlanOut, WeeklyPlanUpdate


router = APIRouter()

# VS/VL template task titles (normalized)
VS_VL_TEMPLATE_TITLES = {
    "analizimi dhe identifikimi i kolonave",
    "plotesimi i template-it te amazonit",
    "kalkulimi i cmimeve",
    "gjenerimi i fotove",
    "kontrollimi i prod. egzsistuese dhe postimi ne amazon",
    "ko1 e projektit vs",
    "ko2 e projektit vs",
    "dream robot vs",
    "dream robot vl",
    "kalkulimi i peshave",
}


def _normalize_title(title: str | None) -> str:
    """Normalize task title for comparison."""
    if not title:
        return ""
    return " ".join(title.strip().lower().split())


def _is_vs_vl_task(task: Task) -> bool:
    """Check if a task is a VS/VL template task by comparing normalized titles."""
    normalized_title = _normalize_title(task.title)
    return normalized_title in VS_VL_TEMPLATE_TITLES


def _is_fast_task(task: Task) -> bool:
    """Fast/ad-hoc tasks must be standalone (no project link) and not system/GA."""
    if task.project_id is not None:
        return False
    if task.dependency_task_id is not None:
        return False
    if task.system_template_origin_id is not None:
        return False
    if task.ga_note_origin_id is not None:
        return False
    if _is_vs_vl_task(task):
        return False
    return True


def _is_mst_or_tt_project(project: Project) -> bool:
    title = (project.title or "").upper().strip()
    is_tt = title == "TT" or title.startswith("TT ") or title.startswith("TT-")
    return project.project_type == ProjectType.MST.value or ("MST" in title) or is_tt


def _parse_ko_user_id(internal_notes: str | None) -> uuid.UUID | None:
    """Parse ko_user_id from task internal_notes.
    
    The KO field is stored as 'ko_user_id=<uuid>' or 'ko_user_id: <uuid>' 
    in the internal_notes field.
    """
    if not internal_notes:
        return None
    # Match pattern: ko_user_id=<uuid> or ko_user_id: <uuid>
    match = re.search(r'ko_user_id[:=]\s*([a-f0-9-]+)', internal_notes, re.IGNORECASE)
    if match:
        try:
            return uuid.UUID(match.group(1))
        except (ValueError, AttributeError):
            return None
    return None


def _parse_origin_task_id(internal_notes: str | None) -> uuid.UUID | None:
    """Parse origin_task_id from task internal_notes."""
    if not internal_notes:
        return None
    match = re.search(r"origin_task_id[:=]\s*([a-f0-9-]+)", internal_notes, re.IGNORECASE)
    if not match:
        return None
    try:
        return uuid.UUID(match.group(1))
    except (ValueError, AttributeError):
        return None


def _parse_total_products(internal_notes: str | None) -> int | None:
    """Parse total_products from task internal_notes."""
    if not internal_notes:
        return None
    match = re.search(r"total_products[:=]\s*(\d+)", internal_notes, re.IGNORECASE)
    if not match:
        return None
    try:
        return int(match.group(1))
    except Exception:
        return None


def _parse_production_date(internal_notes: str | None) -> date | None:
    """Parse production_date (YYYY-MM-DD) from task internal_notes."""
    if not internal_notes:
        return None
    match = re.search(r"production_date[:=]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})", internal_notes, re.IGNORECASE)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%Y-%m-%d").date()
    except Exception:
        return None


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _month_range(year: int, month: int) -> tuple[date, date]:
    month_start = date(year, month, 1)
    next_month = date(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1)
    return month_start, next_month - timedelta(days=1)


def _as_utc_date(value: datetime | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).date() if value.tzinfo else value.date()
    return value


def _as_local_date(value: datetime | date | None) -> date | None:
    """
    Extract the date component from a datetime, preserving the local date meaning.
    For planning purposes, we want the date in Europe/Pristina timezone (UTC+1/+2), not UTC.
    
    When PostgreSQL stores a date like "2026-02-05 00:00:00+01" (midnight in Europe/Pristina),
    it stores the UTC equivalent "2026-02-04 23:00:00 UTC". SQLAlchemy retrieves it as UTC.
    We need to convert back to Europe/Pristina timezone before extracting the date.
    
    Example:
    - Input: 2026-02-04 23:00:00+00:00 (UTC representation of 2026-02-05 00:00:00+01)
    - Output: 2026-02-05 (the intended local date in Europe/Pristina)
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo:
            # Convert UTC datetime back to Europe/Pristina timezone (UTC+1/+2)
            # This ensures we get the date as it was intended (local date)
            pristina_tz = None
            
            # Try zoneinfo with Europe/Pristina
            if ZoneInfo is not None:
                try:
                    pristina_tz = ZoneInfo("Europe/Pristina")
                except Exception:
                    # Europe/Pristina not available, try Europe/Belgrade (same timezone)
                    try:
                        pristina_tz = ZoneInfo("Europe/Belgrade")
                    except Exception:
                        pass
            
            # If zoneinfo failed, try pytz
            if pristina_tz is None:
                try:
                    import pytz
                    try:
                        pristina_tz = pytz.timezone("Europe/Pristina")
                    except Exception:
                        # Fallback to Europe/Belgrade (same timezone as Pristina)
                        pristina_tz = pytz.timezone("Europe/Belgrade")
                except ImportError:
                    # pytz not available, use fixed offset UTC+1
                    pristina_tz = timezone(timedelta(hours=1))
            
            # Convert to local timezone
            local_dt = value.astimezone(pristina_tz)
            # Extract date from local timezone datetime
            return local_dt.date()
        else:
            # Naive datetime, use as-is
            return value.date()
    # Already a date
    return value


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


def _task_to_out(t: Task, assignees: list[TaskAssigneeOut] | None = None) -> TaskOut:
    # Convert string values to enums
    status_enum = TaskStatus(t.status) if t.status else TaskStatus.TODO
    priority_enum = TaskPriority(t.priority) if t.priority else TaskPriority.NORMAL
    finish_period_enum = TaskFinishPeriod(t.finish_period) if t.finish_period else None
    phase_enum = ProjectPhaseStatus(t.phase) if t.phase else ProjectPhaseStatus.MEETINGS
    
    return TaskOut(
        id=t.id,
        title=t.title,
        description=t.description,
        internal_notes=t.internal_notes,
        project_id=t.project_id,
        dependency_task_id=t.dependency_task_id,
        department_id=t.department_id,
        assigned_to=t.assigned_to,
        assignees=assignees or [],
        created_by=t.created_by,
        ga_note_origin_id=t.ga_note_origin_id,
        system_template_origin_id=t.system_template_origin_id,
        status=status_enum,
        priority=priority_enum,
        finish_period=finish_period_enum,
        phase=phase_enum,
        progress_percentage=t.progress_percentage,
        daily_products=t.daily_products,
        start_date=t.start_date,
        due_date=t.due_date,
        completed_at=t.completed_at,
        is_bllok=t.is_bllok,
        is_1h_report=t.is_1h_report,
        is_r1=t.is_r1,
        is_personal=t.is_personal,
        is_active=t.is_active,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def _project_to_out(p: Project) -> ProjectOut:
    # Convert string values to enums
    from app.models.enums import ProjectType
    
    project_type_enum = None
    if p.project_type:
        try:
            project_type_enum = ProjectType(p.project_type)
        except ValueError:
            project_type_enum = None
    
    phase_enum = ProjectPhaseStatus(p.current_phase) if p.current_phase else ProjectPhaseStatus.MEETINGS
    status_enum = TaskStatus(p.status) if p.status else TaskStatus.TODO
    
    return ProjectOut(
        id=p.id,
        title=p.title,
        description=p.description,
        department_id=p.department_id,
        manager_id=p.manager_id,
        created_by=p.created_by,
        project_type=project_type_enum,
        current_phase=phase_enum,
        status=status_enum,
        progress_percentage=p.progress_percentage,
        total_products=p.total_products,
        is_template=p.is_template,
        start_date=p.start_date,
        due_date=p.due_date,
        completed_at=p.completed_at,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _get_next_5_working_days(start_date: date) -> list[date]:
    """Get next 5 working days (Monday-Friday) starting from start_date.
    If start_date is a weekend, starts from next Monday."""
    # If start_date is Saturday (5) or Sunday (6), move to next Monday
    if start_date.weekday() >= 5:
        days_until_monday = 7 - start_date.weekday()
        start_date = start_date + timedelta(days=days_until_monday)
    
    working_days = []
    current = start_date
    while len(working_days) < 5:
        # Monday = 0, Sunday = 6
        if current.weekday() < 5:  # Monday to Friday
            working_days.append(current)
        current += timedelta(days=1)
    return working_days


@router.get("/weekly", response_model=WeeklyPlannerResponse)
async def weekly_planner(
    week_start: date | None = None,
    department_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> WeeklyPlannerResponse:
    today = datetime.now(timezone.utc).date()
    week_start_date = week_start or _week_start(today)
    # Get next 5 working days (Monday-Friday)
    working_days = _get_next_5_working_days(week_start_date)
    week_end = working_days[-1]

    if user.role == UserRole.STAFF:
        user_id = user.id
        department_id = user.department_id

    # Handle "All Departments" case - if department_id is provided, check access
    # If not provided (None), admins and managers can see all, others see their department
    if department_id is not None:
        ensure_department_access(user, department_id)
    elif user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        # Non-admin/manager users without department_id should see their own department
        department_id = user.department_id

    # Get active projects (not completed, not templates)
    project_stmt = select(Project).where(
        Project.completed_at.is_(None),
        Project.is_template == False,
    )
    if department_id is not None:
        project_stmt = project_stmt.where(Project.department_id == department_id)
    projects = (await db.execute(project_stmt.order_by(Project.created_at))).scalars().all()
    project_map = {p.id: p for p in projects}

    # Get all active tasks (including completed ones so they can show through completion day)
    task_stmt = select(Task).where(Task.is_active == True)
    if department_id is not None:
        task_stmt = task_stmt.where(Task.department_id == department_id)
    # Note: We don't filter by user_id at SQL level to allow KO field checking in Python
    # Filtering by user will be done after fetching tasks
    
    all_tasks = (await db.execute(task_stmt.order_by(Task.due_date.nullsfirst(), Task.created_at))).scalars().all()
    
    # Filter by user_id if provided (check assigned_to, assignees, and KO field for MST/TT Control phase)
    if user_id is not None:
        # Get task IDs with this user as assignee
        task_ids_with_assignee = (
            await db.execute(
                select(TaskAssignee.task_id).where(TaskAssignee.user_id == user_id).distinct()
            )
        ).scalars().all()
        task_ids_with_assignee_set = set(task_ids_with_assignee)
        
        # Filter tasks: include if assigned_to matches, assignee matches, or KO field matches (for MST/TT Control)
        filtered_tasks = []
        for t in all_tasks:
            # Check assigned_to
            if t.assigned_to == user_id:
                filtered_tasks.append(t)
                continue
            # Check assignees
            if t.id in task_ids_with_assignee_set:
                filtered_tasks.append(t)
                continue
            # For MST/TT projects in Control phase, check KO field
            if t.project_id is not None and t.phase == ProjectPhaseStatus.CONTROL.value:
                project = project_map.get(t.project_id)
                if project is not None and _is_mst_or_tt_project(project):
                    ko_user_id = _parse_ko_user_id(t.internal_notes)
                    if ko_user_id == user_id:
                        filtered_tasks.append(t)
                        continue
        
        all_tasks = filtered_tasks
    
    # Get task assignees
    task_ids = [t.id for t in all_tasks]
    assignee_map = await _assignees_for_tasks(db, task_ids)
    # Fallback to assigned_to if no assignees
    fallback_ids = [
        t.assigned_to
        for t in all_tasks
        if t.assigned_to is not None and not assignee_map.get(t.id)
    ]
    if fallback_ids:
        fallback_users = (
            await db.execute(select(User).where(User.id.in_(fallback_ids)))
        ).scalars().all()
        fallback_map = {user.id: user for user in fallback_users}
        for t in all_tasks:
            if assignee_map.get(t.id):
                continue
            if t.assigned_to in fallback_map:
                assignee_map[t.id] = [_user_to_assignee(fallback_map[t.assigned_to])]

    # Prefetch active system task templates and resolve assignees for weekly planner display.
    # Weekly Planner must show only the occurrences that belong to the selected week and day (no overdue/late).
    system_templates = (
        await db.execute(select(SystemTaskTemplate).where(SystemTaskTemplate.is_active.is_(True)))
    ).scalars().all()
    system_template_ids = [t.id for t in system_templates]
    # template_id -> set[user_id]
    system_template_assignees: dict[uuid.UUID, set[uuid.UUID]] = {tid: set() for tid in system_template_ids}
    if system_template_ids:
        sys_tasks = (
            await db.execute(
                select(Task.id, Task.system_template_origin_id, Task.assigned_to)
                .where(Task.system_template_origin_id.in_(system_template_ids))
            )
        ).all()
        sys_task_ids = [row[0] for row in sys_tasks]
        task_assignee_rows = []
        if sys_task_ids:
            task_assignee_rows = (
                await db.execute(
                    select(TaskAssignee.task_id, TaskAssignee.user_id).where(TaskAssignee.task_id.in_(sys_task_ids))
                )
            ).all()
        assignees_by_task: dict[uuid.UUID, set[uuid.UUID]] = {}
        for task_id, user_id in task_assignee_rows:
            assignees_by_task.setdefault(task_id, set()).add(user_id)
        for task_id, template_id, assigned_to in sys_tasks:
            if template_id is None:
                continue
            explicit = assignees_by_task.get(task_id) or set()
            if explicit:
                system_template_assignees.setdefault(template_id, set()).update(explicit)
            elif assigned_to is not None:
                system_template_assignees.setdefault(template_id, set()).add(assigned_to)
        # fallback to template.default_assignee_id when no Task/TaskAssignee mapping exists
        for tmpl in system_templates:
            if not system_template_assignees.get(tmpl.id) and tmpl.default_assignee_id is not None:
                system_template_assignees.setdefault(tmpl.id, set()).add(tmpl.default_assignee_id)

    # Weekly Planner = planning-only (no overdue/late, no carry-over).
    def _planned_range_weekly(task: Task) -> tuple[date | None, date | None]:
        if task.due_date is None:
            return None, None
        due = _as_local_date(task.due_date)
        if due is None:
            return None, None
        
        # MST/TT project tasks: show only on due_date (ignore start_date)
        is_mst_tt_project = False
        if task.project_id and task.project_id in project_map:
            project = project_map[task.project_id]
            if project:
                is_mst_tt_project = _is_mst_or_tt_project(project)
        if is_mst_tt_project and task.project_id is not None:
            return due, due

        if task.start_date is not None:
            start = _as_local_date(task.start_date)
            if start is None:
                return due, due
            if start <= due:
                return start, due
        return due, due

    def _overlaps_selected_week(task: Task) -> bool:
        start, end = _planned_range_weekly(task)
        if start is None or end is None:
            return False
        return start <= working_days[-1] and end >= working_days[0]

    week_tasks = [t for t in all_tasks if t.system_template_origin_id is None and _overlaps_selected_week(t)]
    overdue: list[TaskOut] = []

    # Organize tasks by project
    project_tasks_map: dict[uuid.UUID, list[Task]] = {}
    for task in week_tasks:
        if task.project_id is not None:
            if task.project_id not in project_tasks_map:
                project_tasks_map[task.project_id] = []
            project_tasks_map[task.project_id].append(task)

    # Create project list with their tasks
    projects_with_tasks: list[WeeklyPlannerProject] = []
    for project in projects:
        if project.id in project_tasks_map:
            project_tasks = project_tasks_map[project.id]
            projects_with_tasks.append(
                WeeklyPlannerProject(
                    project=_project_to_out(project),
                    tasks=[_task_to_out(t, assignee_map.get(t.id, [])) for t in project_tasks],
                )
            )

    # Fast tasks (standalone ad-hoc tasks only)
    fast_tasks = [
        _task_to_out(t, assignee_map.get(t.id, []))
        for t in week_tasks
        if _is_fast_task(t)
    ]

    # Organize tasks by day for the days view
    days: list[WeeklyPlannerDay] = []
    for d in working_days:
        day_tasks = []
        for t in week_tasks:
            start, end = _planned_range_weekly(t)
            if start is None or end is None:
                continue
            if start <= d <= end:
                day_tasks.append(_task_to_out(t, assignee_map.get(t.id, [])))
        days.append(WeeklyPlannerDay(date=d, tasks=day_tasks))

    return WeeklyPlannerResponse(
        week_start=week_start_date,
        week_end=week_end,
        overdue=overdue,
        projects=projects_with_tasks,
        fast_tasks=fast_tasks,
        days=days,
    )


@router.get("/monthly", response_model=MonthlyPlannerResponse)
async def monthly_planner(
    year: int,
    month: int,
    department_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> MonthlyPlannerResponse:
    if user.role == UserRole.STAFF:
        user_id = user.id
        department_id = user.department_id

    if department_id is not None:
        ensure_department_access(user, department_id)
    elif user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        department_id = user.department_id

    month_start, month_end = _month_range(year, month)

    stmt = select(Task).where(Task.planned_for.is_not(None), Task.planned_for >= month_start, Task.planned_for <= month_end)
    if department_id is not None:
        stmt = stmt.where(Task.department_id == department_id)
    if user_id is not None:
        stmt = stmt.where(Task.assigned_to_user_id == user_id)

    tasks = (await db.execute(stmt.order_by(Task.planned_for, Task.created_at))).scalars().all()
    task_out = [_task_to_out(t) for t in tasks]

    recurring = [t for t in task_out if t.task_type.value == "system"]

    prev_month = month - 1
    prev_year = year
    if prev_month == 0:
        prev_month = 12
        prev_year -= 1
    prev_start, prev_end = _month_range(prev_year, prev_month)

    base_filters = [Task.planned_for.is_not(None)]
    if department_id is not None:
        base_filters.append(Task.department_id == department_id)
    if user_id is not None:
        base_filters.append(Task.assigned_to_user_id == user_id)

    month_completed = (
        await db.execute(
            select(func.count(Task.id)).where(
                *base_filters,
                Task.planned_for >= month_start,
                Task.planned_for <= month_end,
                Task.completed_at.is_not(None),
            )
        )
    ).scalar_one()
    prev_completed = (
        await db.execute(
            select(func.count(Task.id)).where(
                *base_filters,
                Task.planned_for >= prev_start,
                Task.planned_for <= prev_end,
                Task.completed_at.is_not(None),
            )
        )
    ).scalar_one()

    return MonthlyPlannerResponse(
        month_start=month_start,
        month_end=month_end,
        tasks=task_out,
        recurring=recurring,
        summary=MonthlyPlannerSummary(month_completed=month_completed, previous_month_completed=prev_completed),
    )


# Weekly Plan CRUD endpoints
@router.get("/weekly-plans", response_model=list[WeeklyPlanOut])
async def list_weekly_plans(
    department_id: uuid.UUID | None = None,
    week_start: date | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[WeeklyPlanOut]:
    """List weekly plans, optionally filtered by department and week"""
    stmt = select(WeeklyPlan)
    
    if department_id is not None:
        ensure_department_access(user, department_id)
        stmt = stmt.where(WeeklyPlan.department_id == department_id)
    elif user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        if user.department_id is not None:
            stmt = stmt.where(WeeklyPlan.department_id == user.department_id)
        else:
            return []
    
    if week_start is not None:
        week_end = week_start + timedelta(days=6)
        stmt = stmt.where(
            (WeeklyPlan.start_date <= week_end) & (WeeklyPlan.end_date >= week_start)
        )
    
    plans = (await db.execute(stmt.order_by(WeeklyPlan.start_date.desc()))).scalars().all()
    return [
        WeeklyPlanOut(
            id=p.id,
            department_id=p.department_id,
            start_date=p.start_date,
            end_date=p.end_date,
            content=p.content,
            is_finalized=p.is_finalized,
            created_by=p.created_by,
            created_at=p.created_at,
        )
        for p in plans
    ]


@router.get("/weekly-plans/{plan_id}", response_model=WeeklyPlanOut)
async def get_weekly_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> WeeklyPlanOut:
    """Get a specific weekly plan"""
    plan = (await db.execute(select(WeeklyPlan).where(WeeklyPlan.id == plan_id))).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly plan not found")
    
    if plan.department_id is not None:
        ensure_department_access(user, plan.department_id)
    elif user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    
    return WeeklyPlanOut(
        id=plan.id,
        department_id=plan.department_id,
        start_date=plan.start_date,
        end_date=plan.end_date,
        content=plan.content,
        is_finalized=plan.is_finalized,
        created_by=plan.created_by,
        created_at=plan.created_at,
    )


@router.post("/weekly-plans", response_model=WeeklyPlanOut)
async def create_weekly_plan(
    payload: WeeklyPlanCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> WeeklyPlanOut:
    """Create a new weekly plan"""
    ensure_manager_or_admin(user)
    
    if payload.department_id is not None:
        ensure_department_access(user, payload.department_id)
    
    plan = WeeklyPlan(
        department_id=payload.department_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        content=payload.content,
        is_finalized=payload.is_finalized or False,
        created_by=user.id,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    
    return WeeklyPlanOut(
        id=plan.id,
        department_id=plan.department_id,
        start_date=plan.start_date,
        end_date=plan.end_date,
        content=plan.content,
        is_finalized=plan.is_finalized,
        created_by=plan.created_by,
        created_at=plan.created_at,
    )


@router.patch("/weekly-plans/{plan_id}", response_model=WeeklyPlanOut)
async def update_weekly_plan(
    plan_id: uuid.UUID,
    payload: WeeklyPlanUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> WeeklyPlanOut:
    """Update a weekly plan"""
    ensure_manager_or_admin(user)
    
    plan = (await db.execute(select(WeeklyPlan).where(WeeklyPlan.id == plan_id))).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly plan not found")
    
    if plan.department_id is not None:
        ensure_department_access(user, plan.department_id)
    elif user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    
    if payload.content is not None:
        plan.content = payload.content
    if payload.is_finalized is not None:
        plan.is_finalized = payload.is_finalized
    
    await db.commit()
    await db.refresh(plan)
    
    return WeeklyPlanOut(
        id=plan.id,
        department_id=plan.department_id,
        start_date=plan.start_date,
        end_date=plan.end_date,
        content=plan.content,
        is_finalized=plan.is_finalized,
        created_by=plan.created_by,
        created_at=plan.created_at,
    )


@router.delete("/weekly-plans/{plan_id}")
async def delete_weekly_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> Response:
    """Delete a weekly plan"""
    ensure_manager_or_admin(user)
    
    plan = (await db.execute(select(WeeklyPlan).where(WeeklyPlan.id == plan_id))).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly plan not found")
    
    if plan.department_id is not None:
        ensure_department_access(user, plan.department_id)
    elif user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    
    await db.delete(plan)
    await db.commit()
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/weekly-table", response_model=WeeklyTableResponse)
async def weekly_table_planner(
    week_start: date | None = None,
    department_id: uuid.UUID | None = None,
    is_this_week: bool = False,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> WeeklyTableResponse:
    """Get weekly planner in table format organized by departments, users, days, and AM/PM"""
    today = datetime.now(timezone.utc).date()
    
    # Determine which week to show
    if is_this_week:
        # This week: show the plan that was made for next week but is now this week
        week_start_date = _week_start(today)
    else:
        # Next week: show the plan for the upcoming week
        week_start_date = week_start or _week_start(today + timedelta(days=7))
    
    working_days = _get_next_5_working_days(week_start_date)
    week_end = working_days[-1]
    
    # Identify departments with special weekly planner logic (use all departments, not filtered)
    all_dept_rows = (await db.execute(select(Department.id, Department.name))).all()
    dev_dept_names = {"Development"}
    dev_dept_ids = {dept_id for dept_id, name in all_dept_rows if name in dev_dept_names}
    # Product Content department: tasks should only show on due_date, not from start_date to due_date
    # Note: Database may store "Project Content Manager" but display name is "Product Content"
    pc_dept_names = {"Product Content", "Project Content Manager"}
    pc_dept_ids = {dept_id for dept_id, name in all_dept_rows if name in pc_dept_names}

    # Get departments to show
    # For STAFF users, always use their own department
    if user.role == UserRole.STAFF:
        department_id = user.department_id
    
    dept_stmt = select(Department)
    if department_id is not None:
        # MANAGERs should have the same access as ADMINS for weekly planner
        # For non-ADMIN/MANAGER users, ensure they can only access their own department
        # If they try to access a different department, silently use their own instead
        if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
            if user.department_id is not None and user.department_id != department_id:
                # User tried to access a different department - use their own instead
                department_id = user.department_id
            elif user.department_id is None:
                # User has no department - return empty response
                return WeeklyTableResponse(
                    week_start=week_start_date,
                    week_end=week_end,
                    departments=[],
                    saved_plan_id=None,
                )
        dept_stmt = dept_stmt.where(Department.id == department_id)
    elif user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        # Non-admin/manager users without department_id parameter should see their own department
        if user.department_id is not None:
            department_id = user.department_id
            dept_stmt = dept_stmt.where(Department.id == user.department_id)
        else:
            # User has no department - return empty response
            return WeeklyTableResponse(
                week_start=week_start_date,
                week_end=week_end,
                departments=[],
                saved_plan_id=None,
            )
    
    # Check if there's a saved plan for this week (after department_id is finalized)
    saved_plan_id: uuid.UUID | None = None
    if department_id is not None:
        plan_stmt = select(WeeklyPlan).where(
            WeeklyPlan.department_id == department_id,
            WeeklyPlan.start_date == week_start_date,
        )
        saved_plan = (await db.execute(plan_stmt)).scalar_one_or_none()
        if saved_plan:
            saved_plan_id = saved_plan.id
    
    departments = (await db.execute(dept_stmt.order_by(Department.name))).scalars().all()
    
    # Get all users - filter by department if a specific department is selected
    users_stmt = select(User).where(User.is_active == True)
    if department_id is not None:
        users_stmt = users_stmt.where(User.department_id == department_id)
    all_users = (await db.execute(users_stmt.order_by(User.full_name))).scalars().all()
    
    # Get projects (not templates). Completed projects are included for weekly overlap logic.
    # We don't filter by department here because we show tasks by assignee department.
    project_stmt = select(Project).where(Project.is_template == False)
    projects = (await db.execute(project_stmt.order_by(Project.created_at))).scalars().all()
    project_map = {p.id: p for p in projects}
    
    # Get active tasks (including completed ones so they can show through completion day).
    # We don't filter by department here because we show tasks by assignee department.
    task_stmt = select(Task).where(Task.is_active == True)
    all_tasks = (await db.execute(task_stmt.order_by(Task.due_date.nullsfirst(), Task.created_at))).scalars().all()
    
    # Filter tasks for the selected week (planning only):
    # - show tasks ONLY if they belong to the selected week
    # - show tasks ONLY on their planned days
    # - NEVER carry over tasks from previous weeks
    # - NEVER include unscheduled tasks (no due_date), except special-cases handled in _planned_range
    def _planned_range(task: Task) -> tuple[date | None, date | None]:
        if task.due_date is None:
            # Special-case: Product Content MST/TT CONTROL tasks without a due_date.
            # These tasks are driven by KO and totals; if no explicit production_date/due_date is set,
            # show them across the visible week (up to project due date) so they still appear in Weekly Planner.
            if task.project_id is None:
                return None, None
            project = project_map.get(task.project_id)
            if project is None:
                return None, None
            is_mst_tt_project = _is_mst_or_tt_project(project)
            is_control = task.phase == ProjectPhaseStatus.CONTROL.value
            is_pc_task = (task.department_id in pc_dept_ids) or (project.department_id in pc_dept_ids)
            if is_pc_task and is_mst_tt_project and is_control:
                production_date = _parse_production_date(task.internal_notes)
                if production_date is not None:
                    return production_date, production_date
                project_due = _as_local_date(project.due_date)
                if project_due is None:
                    return None, None
                start = working_days[0]
                end = min(project_due, week_end)
                if end < start:
                    return None, None
                return start, end
            return None, None
        due = _as_local_date(task.due_date)
        if due is None:
            return None, None
        
        # DEBUG: Log for LEA BLLOK TASK
        if task.title and "LEA BLLOK" in task.title.upper():
            logger = logging.getLogger(__name__)
            logger.warning(
                f"[PLANNED_RANGE DEBUG] task_id={task.id}, title={task.title}: "
                f"due_date_raw={task.due_date}, "
                f"due_date_type={type(task.due_date)}, "
                f"due_date_tzinfo={task.due_date.tzinfo if hasattr(task.due_date, 'tzinfo') else None}, "
                f"due_converted={due}, "
                f"start_date_raw={task.start_date}, "
                f"start_date_tzinfo={task.start_date.tzinfo if task.start_date and hasattr(task.start_date, 'tzinfo') else None}"
            )
        
        # MST/TT project tasks: show only on due_date (ignore start_date)
        task_dept_id = task.department_id
        project_dept_id = None
        is_mst_tt_project = False
        if task.project_id:
            # Try to get project from map
            if task.project_id in project_map:
                project = project_map[task.project_id]
                if project:
                    project_dept_id = project.department_id
                    is_mst_tt_project = _is_mst_or_tt_project(project)
            # If project not in map, try to find it (shouldn't happen, but defensive)
            else:
                # Project should already be in map, but if not, we'll check task's department
                pass
        if is_mst_tt_project and task.project_id is not None:
            return due, due

        # For Product Content department, tasks should only show on due_date, not from start_date to due_date
        # Check both task's department_id and project's department_id (in case task doesn't have department_id set)
        is_pc_task = (task_dept_id in pc_dept_ids) or (project_dept_id in pc_dept_ids)
        if is_pc_task and task.project_id is not None:
            # Product Content project tasks: show only on due_date (ignore start_date)
            return due, due
        
        # For all other tasks (including fast tasks), use start_date if available
        if task.start_date is not None:
            start = _as_local_date(task.start_date)
            if start is None:
                return due, due
            
            # DEBUG: Log start date conversion
            if task.title and "LEA BLLOK" in task.title.upper():
                logger = logging.getLogger(__name__)
                logger.warning(
                    f"[PLANNED_RANGE DEBUG] task_id={task.id}: "
                    f"start_converted={start}, "
                    f"due_converted={due}, "
                    f"range=({start}, {due})"
                )
            
            # Only treat start_date as planning start if it forms a valid interval.
            if start <= due:
                return start, due
        # Default: single-day planned task on due date.
        return due, due

    def _task_active_range(task: Task) -> tuple[date | None, date | None]:
        # Check if task belongs to Development department (check both task and project)
        task_dept_id = task.department_id
        project_dept_id = None
        if task.project_id and task.project_id in project_map:
            project = project_map[task.project_id]
            if project:
                project_dept_id = project.department_id
        is_dev_task = (task_dept_id in dev_dept_ids) or (project_dept_id in dev_dept_ids)
        
        if is_dev_task and task.project_id is not None:
            # Development weekly plan: show project tasks from start_date to due_date (not created_at).
            start, end = _planned_range(task)
            if start is None or end is None:
                # Ensures dev project tasks without due_date do not appear in weekly plan.
                return None, None

            # Completed tasks should stop on their completion day, but never extend past due_date.
            if task.completed_at:
                completed_date = _as_utc_date(task.completed_at)
                if completed_date is not None and completed_date < end:
                    end = completed_date

            if end < start:
                return None, None
            return start, end
        start, end = _planned_range(task)
        if start is None or end is None:
            return None, None
        
        # DEBUG: Log for LEA BLLOK TASK
        if task.title and "LEA BLLOK" in task.title.upper():
            logger = logging.getLogger(__name__)
            is_fast = _is_fast_task(task)
            logger.warning(
                f"[TASK_ACTIVE_RANGE DEBUG] task_id={task.id}, title={task.title}: "
                f"is_fast_task={is_fast}, "
                f"status={task.status}, "
                f"completed_at={task.completed_at}, "
                f"planned_range=({start}, {end})"
            )
        
        # For FAST TASKS, never adjust date range based on completed_at or status.
        # Always use the original start_date and due_date from _planned_range.
        if not _is_fast_task(task) and task.completed_at:
            completed_date = _as_utc_date(task.completed_at)
            if completed_date is not None:
                # Check if this is an MST/TT task
                is_mst_tt_task = False
                if task.project_id and task.project_id in project_map:
                    project = project_map[task.project_id]
                    if project:
                        is_mst_tt_task = _is_mst_or_tt_project(project)
                
                if is_mst_tt_task:
                    # For MST/TT tasks, if completed, show on the completion day
                    # Use completed_date as both start and end to ensure it shows on that day
                    start = completed_date
                    end = completed_date
                elif completed_date < end:
                    end = completed_date
        
        # DEBUG: Log final range
        if task.title and "LEA BLLOK" in task.title.upper():
            logger = logging.getLogger(__name__)
            logger.warning(
                f"[TASK_ACTIVE_RANGE DEBUG] task_id={task.id}: "
                f"final_range=({start}, {end})"
            )
        
        if end < start:
            return None, None
        return start, end

    def _overlaps_week(task: Task) -> bool:
        start, end = _task_active_range(task)
        if start is None or end is None:
            return False
        return start <= working_days[-1] and end >= working_days[0]

    week_tasks: list[Task] = []
    task_project_ids: set[uuid.UUID] = set()
    for t in all_tasks:
        if t.system_template_origin_id is not None:
            continue
        if not _overlaps_week(t):
            continue
        week_tasks.append(t)
        if t.project_id is not None:
            task_project_ids.add(t.project_id)
    
    # Ensure project_map includes all projects referenced by tasks
    missing_project_ids = task_project_ids - set(project_map.keys())
    if missing_project_ids:
        missing_projects = (await db.execute(
            select(Project).where(Project.id.in_(missing_project_ids))
        )).scalars().all()
        for p in missing_projects:
            project_map[p.id] = p

    # Prefetch per-day progress statuses for MST/TT tasks so we can paint each day cell independently.
    mst_tt_task_ids: set[uuid.UUID] = set()
    for t in week_tasks:
        if t.project_id is None:
            continue
        if t.phase not in (ProjectPhaseStatus.PRODUCT.value, ProjectPhaseStatus.CONTROL.value):
            continue
        project = project_map.get(t.project_id)
        if project is not None and _is_mst_or_tt_project(project):
            mst_tt_task_ids.add(t.id)

    daily_progress_map: dict[tuple[uuid.UUID, date], TaskStatus] = {}
    if mst_tt_task_ids:
        rows = (
            await db.execute(
                select(TaskDailyProgress.task_id, TaskDailyProgress.day_date, TaskDailyProgress.daily_status)
                .where(TaskDailyProgress.task_id.in_(list(mst_tt_task_ids)))
                .where(TaskDailyProgress.day_date >= working_days[0])
                .where(TaskDailyProgress.day_date <= working_days[-1])
            )
        ).all()
        for task_id_row, day_date_row, daily_status_row in rows:
            try:
                daily_progress_map[(task_id_row, day_date_row)] = TaskStatus(daily_status_row)
            except Exception:
                daily_progress_map[(task_id_row, day_date_row)] = TaskStatus.TODO
    
    # Get task assignees for all week tasks
    task_ids = [t.id for t in week_tasks]
    assignee_map = await _assignees_for_tasks(db, task_ids)
    # Fallback to assigned_to
    fallback_ids = [
        t.assigned_to
        for t in week_tasks
        if t.assigned_to is not None and not assignee_map.get(t.id)
    ]
    if fallback_ids:
        fallback_users = (
            await db.execute(select(User).where(User.id.in_(fallback_ids)))
        ).scalars().all()
        fallback_map = {u.id: u for u in fallback_users}
        for t in week_tasks:
            if assignee_map.get(t.id):
                continue
            if t.assigned_to in fallback_map:
                assignee_map[t.id] = [_user_to_assignee(fallback_map[t.assigned_to])]

    # Derive product totals for MST/TT CONTROL tasks.
    # These tasks often store totals in internal_notes (total_products=...) or reference an origin task
    # via origin_task_id whose daily_products holds the total.
    mst_tt_control_total_by_task_id: dict[uuid.UUID, int] = {}
    mst_tt_control_origin_by_task_id: dict[uuid.UUID, uuid.UUID] = {}
    origin_task_ids: set[uuid.UUID] = set()
    for t in week_tasks:
        if t.id not in mst_tt_task_ids:
            continue
        if t.phase != ProjectPhaseStatus.CONTROL.value:
            continue
        notes_total = _parse_total_products(t.internal_notes)
        if notes_total is not None:
            mst_tt_control_total_by_task_id[t.id] = notes_total
            continue
        origin_id = _parse_origin_task_id(t.internal_notes)
        if origin_id is not None:
            mst_tt_control_origin_by_task_id[t.id] = origin_id
            origin_task_ids.add(origin_id)

    if origin_task_ids:
        origin_rows = (
            await db.execute(
                select(Task.id, Task.daily_products, Task.internal_notes).where(Task.id.in_(list(origin_task_ids)))
            )
        ).all()
        origin_total_by_id: dict[uuid.UUID, int] = {}
        for origin_id, origin_daily_products, origin_internal_notes in origin_rows:
            if origin_daily_products is not None:
                origin_total_by_id[origin_id] = int(origin_daily_products)
                continue
            notes_total = _parse_total_products(origin_internal_notes)
            if notes_total is not None:
                origin_total_by_id[origin_id] = notes_total

        for task_id, origin_id in mst_tt_control_origin_by_task_id.items():
            if task_id in mst_tt_control_total_by_task_id:
                continue
            if origin_id in origin_total_by_id:
                mst_tt_control_total_by_task_id[task_id] = origin_total_by_id[origin_id]

    def _effective_weekly_assignee_ids(task: Task) -> set[uuid.UUID]:
        """
        Effective assignee rule for Weekly Planner (table):
        - For Product Content MST/TT tasks in CONTROL phase: assign ONLY to KO user (if set),
          otherwise hide from weekly planner (empty set).
        - For all other tasks: assign to explicit assignees (TaskAssignee) plus assigned_to fallback.
        """
        project: Project | None = None
        if task.project_id is not None:
            project = project_map.get(task.project_id)

        # Product Content detection mirrors _planned_range logic: check task.department_id and project.department_id.
        task_dept_id = task.department_id
        project_dept_id = project.department_id if project is not None else None
        is_pc_task = (task_dept_id in pc_dept_ids) or (project_dept_id in pc_dept_ids)

        if (
            is_pc_task
            and task.project_id is not None
            and task.phase == ProjectPhaseStatus.CONTROL.value
            and project is not None
            and _is_mst_or_tt_project(project)
        ):
            ko_user_id = _parse_ko_user_id(task.internal_notes)
            return {ko_user_id} if ko_user_id is not None else set()

        ids = {a.id for a in (assignee_map.get(task.id) or [])}
        if task.assigned_to is not None:
            ids.add(task.assigned_to)
        return ids

    exclusion_map: dict[tuple[uuid.UUID, uuid.UUID, date], set[str]] = {}
    if task_ids and all_users:
        user_ids = [u.id for u in all_users]
        exclusion_rows = (
            await db.execute(
                select(
                    TaskPlannerExclusion.task_id,
                    TaskPlannerExclusion.user_id,
                    TaskPlannerExclusion.day_date,
                    TaskPlannerExclusion.time_slot,
                )
                .where(TaskPlannerExclusion.day_date >= working_days[0])
                .where(TaskPlannerExclusion.day_date <= working_days[-1])
                .where(TaskPlannerExclusion.user_id.in_(user_ids))
                .where(TaskPlannerExclusion.task_id.in_(task_ids))
            )
        ).all()
        for task_id, user_id, day_date, time_slot in exclusion_rows:
            slot_value = (time_slot or "ALL").strip().upper()
            exclusion_map.setdefault((task_id, user_id, day_date), set()).add(slot_value)

    def _is_excluded(task_id: uuid.UUID, user_id: uuid.UUID, day_date: date, slot: str) -> bool:
        slots = exclusion_map.get((task_id, user_id, day_date))
        if not slots:
            return False
        if "ALL" in slots:
            return True
        return slot in slots

    project_exclusion_map: dict[tuple[uuid.UUID, uuid.UUID, date], set[str]] = {}
    if project_map and all_users:
        project_ids = list(project_map.keys())
        user_ids = [u.id for u in all_users]
        project_exclusions = (
            await db.execute(
                select(
                    ProjectPlannerExclusion.project_id,
                    ProjectPlannerExclusion.user_id,
                    ProjectPlannerExclusion.day_date,
                    ProjectPlannerExclusion.time_slot,
                )
                .where(ProjectPlannerExclusion.day_date >= working_days[0])
                .where(ProjectPlannerExclusion.day_date <= working_days[-1])
                .where(ProjectPlannerExclusion.user_id.in_(user_ids))
                .where(ProjectPlannerExclusion.project_id.in_(project_ids))
            )
        ).all()
        for project_id, user_id, day_date, time_slot in project_exclusions:
            slot_value = (time_slot or "ALL").strip().upper()
            project_exclusion_map.setdefault((project_id, user_id, day_date), set()).add(slot_value)

    def _is_project_excluded(project_id: uuid.UUID, user_id: uuid.UUID, day_date: date, slot: str) -> bool:
        slots = project_exclusion_map.get((project_id, user_id, day_date))
        if not slots:
            return False
        if "ALL" in slots:
            return True
        return slot in slots

    # Prefetch active system task templates and resolve assignees for weekly planner display.
    system_templates = (
        await db.execute(select(SystemTaskTemplate).where(SystemTaskTemplate.is_active.is_(True)))
    ).scalars().all()
    system_template_ids = [t.id for t in system_templates]
    system_template_assignees: dict[uuid.UUID, set[uuid.UUID]] = {tid: set() for tid in system_template_ids}
    if system_template_ids:
        sys_tasks = (
            await db.execute(
                select(Task.id, Task.system_template_origin_id, Task.assigned_to)
                .where(Task.system_template_origin_id.in_(system_template_ids))
            )
        ).all()
        sys_task_ids = [row[0] for row in sys_tasks]
        task_assignee_rows = []
        if sys_task_ids:
            task_assignee_rows = (
                await db.execute(
                    select(TaskAssignee.task_id, TaskAssignee.user_id).where(TaskAssignee.task_id.in_(sys_task_ids))
                )
            ).all()
        assignees_by_task: dict[uuid.UUID, set[uuid.UUID]] = {}
        for task_id, user_id in task_assignee_rows:
            assignees_by_task.setdefault(task_id, set()).add(user_id)
        for task_id, template_id, assigned_to in sys_tasks:
            if template_id is None:
                continue
            explicit = assignees_by_task.get(task_id) or set()
            if explicit:
                system_template_assignees.setdefault(template_id, set()).update(explicit)
            elif assigned_to is not None:
                system_template_assignees.setdefault(template_id, set()).add(assigned_to)
        for tmpl in system_templates:
            if not system_template_assignees.get(tmpl.id) and tmpl.default_assignee_id is not None:
                system_template_assignees.setdefault(tmpl.id, set()).add(tmpl.default_assignee_id)

    # Get projects with due dates and their members
    # Projects should show for members from Monday until due date
    # If overdue and not completed, show on Monday as late project
    logger = logging.getLogger(__name__)
    projects_with_due_dates = [p for p in projects if p.due_date is not None]
    logger.debug(f"Total projects in department: {len(projects)}")
    logger.debug(f"Projects with due dates (not completed): {len(projects_with_due_dates)}")
    for p in projects_with_due_dates:
        logger.debug(f"  - {p.title} (id={p.id}, due={_as_utc_date(p.due_date)}, dept={p.department_id})")
    
    # Get project members for all projects with due dates
    project_members_map: dict[uuid.UUID, set[uuid.UUID]] = {}
    if projects_with_due_dates:
        project_ids_with_due = [p.id for p in projects_with_due_dates]
        project_members = (
            await db.execute(
                select(ProjectMember.project_id, ProjectMember.user_id)
                .where(ProjectMember.project_id.in_(project_ids_with_due))
            )
        ).all()
        for project_id, user_id in project_members:
            if project_id not in project_members_map:
                project_members_map[project_id] = set()
            project_members_map[project_id].add(user_id)
        
        # Debug logging
        logger.debug(f"Found {len(projects_with_due_dates)} projects with due dates")
        logger.debug(f"Found {len(project_members)} project member relationships")
        for p in projects_with_due_dates:
            members_count = len(project_members_map.get(p.id, set()))
            member_ids = list(project_members_map.get(p.id, set()))
            logger.debug(f"Project {p.title} (id={p.id}, due={_as_utc_date(p.due_date)}) has {members_count} members: {member_ids}")
    
    # Build table structure: Departments -> Days -> Users -> AM/PM
    def get_fast_task_type(task: Task) -> str | None:
        if task.is_bllok:
            return "BLL"
        if task.is_r1:
            return "R1"
        if task.is_1h_report:
            return "1H"
        if task.ga_note_origin_id is not None:
            return "GA"
        if task.is_personal:
            return "P:"
        return None

    departments_data: list[WeeklyTableDepartment] = []
    
    # Debug: Log task counts
    logger.debug(f"Weekly planner: Found {len(week_tasks)} tasks for week {week_start_date} to {week_end}")
    
    for dept in departments:
        # Show only users from this specific department (exclude users with no department)
        dept_users = [u for u in all_users if u.department_id is not None and u.department_id == dept.id]
        # Show tasks that belong to users in this department (regardless of task.department_id)
        dept_user_ids = {u.id for u in dept_users}
        dept_tasks = []
        for t in week_tasks:
            effective_ids = _effective_weekly_assignee_ids(t)
            if effective_ids.intersection(dept_user_ids):
                dept_tasks.append(t)
                continue
        
        # Organize tasks by day and user
        days_data: list[WeeklyTableDay] = []
        
        for day_date in working_days:
            users_day_data: list[WeeklyTableUserDay] = []
            
            for dept_user in dept_users:
                # Get tasks for this user on this day
                user_task_ids = set()
                for t in dept_tasks:
                    effective_ids = _effective_weekly_assignee_ids(t)
                    if dept_user.id in effective_ids:
                        user_task_ids.add(t.id)
                
                # Planning-only per-day filtering:
                # - single-day tasks show only on due_date
                # - multi-day tasks show on each active day within [start_date..due_date]
                user_tasks = []
                for t in dept_tasks:
                    if t.id not in user_task_ids:
                        continue
                    start, end = _task_active_range(t)
                    if start is None or end is None:
                        continue
                    
                    # DEBUG: Log day filtering for LEA BLLOK TASK
                    if t.title and "LEA BLLOK" in t.title.upper():
                        logger = logging.getLogger(__name__)
                        appears_today = start <= day_date <= end
                        logger.warning(
                            f"[DAY_FILTER DEBUG] task_id={t.id}, day={day_date}: "
                            f"range=({start}, {end}), "
                            f"appears_today={appears_today}, "
                            f"check: {start} <= {day_date} <= {end}"
                        )
                    
                    if start <= day_date <= end:
                        user_tasks.append(t)
                
                # Add projects with due dates for this user
                # Projects should show from Monday until due date
                # If overdue (due_date < Monday) and not completed, show on Monday as late project
                user_projects_with_due: set[uuid.UUID] = set()
                user_late_projects: set[uuid.UUID] = set()
                for project in projects_with_due_dates:
                    # Check if user is a member of this project
                    if project.id not in project_members_map:
                        logger.debug(f"Project {project.title} (id={project.id}) has no members in map - skipping")
                        continue
                    if dept_user.id not in project_members_map[project.id]:
                        logger.debug(f"Project {project.title} (id={project.id}) - user {dept_user.full_name} (id={dept_user.id}) is not a member. Members: {list(project_members_map[project.id])}")
                        continue
                    
                    # No department filter here: project visibility is based on membership
                    
                    project_due_date = _as_utc_date(project.due_date)
                    if project_due_date is None:
                        continue
                    project_start_date = _as_utc_date(project.created_at)
                    if project_start_date is None:
                        continue
                    project_end_date = project_due_date
                    if project.completed_at is not None:
                        completed_day = _as_utc_date(project.completed_at)
                        if completed_day is not None:
                            project_end_date = min(project_end_date, completed_day)
                    monday_of_week = working_days[0]
                    week_end = working_days[-1]
                    
                    # Debug logging for this specific project
                    logger.info(
                        f"[PROJECT CHECK] {project.title}: "
                        f"start={project_start_date}, due={project_due_date}, "
                        f"monday={monday_of_week}, week_end={week_end}, "
                        f"day={day_date}, user={dept_user.full_name}, "
                        f"dept={dept.name}"
                    )
                    
                    # Determine if project should show on this day (created -> due, stop on completion)
                    should_show = False
                    effective_start = max(project_start_date, monday_of_week)

                    if project_start_date <= week_end:
                        if day_date >= effective_start and day_date <= project_end_date and day_date <= week_end:
                            should_show = True
                            logger.debug(f"Project {project.title} showing from {effective_start} to {project_end_date} on {day_date}")
                    else:
                        logger.debug(f"Project {project.title} start_date {project_start_date} is after week_end {week_end} - not showing")
                    
                    if should_show:
                        user_projects_with_due.add(project.id)
                        logger.info(
                            f"[PROJECT ADDED] {project.title} added to user_projects_with_due for "
                            f"user={dept_user.full_name}, day={day_date}"
                        )
                        # Ensure project is in project_map
                        if project.id not in project_map:
                            project_map[project.id] = project
                    else:
                        logger.debug(
                            f"[PROJECT SKIPPED] {project.title} NOT added - "
                            f"start={project_start_date}, due={project_due_date}, "
                            f"monday={monday_of_week}, day={day_date}, week_end={week_end}"
                        )
                
                # Debug: Log user tasks found
                if user_tasks:
                    logger.debug(f"User {dept_user.full_name} on {day_date}: {len(user_tasks)} tasks")
                if user_projects_with_due:
                    logger.info(f"[USER PROJECTS] User {dept_user.full_name} on {day_date}: {len(user_projects_with_due)} projects with due dates: {list(user_projects_with_due)}")
                else:
                    logger.debug(f"User {dept_user.full_name} on {day_date}: NO projects with due dates")
                
                # Separate tasks by type: projects, system tasks, fast tasks
                # And split by AM/PM based on finish_period
                am_projects_map: dict[uuid.UUID, list[Task]] = {}
                pm_projects_map: dict[uuid.UUID, list[Task]] = {}
                am_system_tasks: list[WeeklyTableTaskEntry] = []
                pm_system_tasks: list[WeeklyTableTaskEntry] = []
                am_fast_tasks: list[WeeklyTableTaskEntry] = []
                pm_fast_tasks: list[WeeklyTableTaskEntry] = []

                for task in user_tasks:
                    # Handle finish_period: None or empty means both AM and PM
                    # Check if finish_period is None, empty string, or not a valid AM/PM value
                    finish_period_value = task.finish_period
                    
                    # Normalize the finish_period value
                    finish_period_upper = None
                    if finish_period_value:
                        finish_period_str = str(finish_period_value).strip()
                        if finish_period_str:
                            finish_period_upper = finish_period_str.upper()
                    
                    # Determine which time slot(s) this task should appear in
                    is_pm = finish_period_upper == "PM"
                    is_am = finish_period_upper == "AM"
                    # If finish_period is None, empty, or not "AM"/"PM", it should appear in both slots
                    is_both = not finish_period_upper or finish_period_upper not in ("AM", "PM")
                    
                    # System tasks (have system_template_origin_id)
                    if task.system_template_origin_id is not None:
                        continue
                    # Fast tasks (standalone ad-hoc tasks only)
                    elif _is_fast_task(task):
                        entry = WeeklyTableTaskEntry(
                            task_id=task.id,
                            title=task.title,
                            status=TaskStatus(task.status) if task.status else TaskStatus.TODO,
                            daily_status=None,
                            completed_at=task.completed_at,
                            daily_products=task.daily_products,
                            finish_period=task.finish_period,
                            fast_task_type=get_fast_task_type(task),
                            is_bllok=task.is_bllok,
                            is_1h_report=task.is_1h_report,
                            is_r1=task.is_r1,
                            is_personal=task.is_personal,
                            ga_note_origin_id=task.ga_note_origin_id,
                        )
                        if is_both:
                            # Add to both AM and PM
                            if not _is_excluded(task.id, dept_user.id, day_date, "AM"):
                                am_fast_tasks.append(entry)
                            if not _is_excluded(task.id, dept_user.id, day_date, "PM"):
                                pm_fast_tasks.append(entry)
                        elif is_pm:
                            if not _is_excluded(task.id, dept_user.id, day_date, "PM"):
                                pm_fast_tasks.append(entry)
                        else:
                            # Default to AM if not PM and not both
                            if not _is_excluded(task.id, dept_user.id, day_date, "AM"):
                                am_fast_tasks.append(entry)
                    # Project tasks (have project_id)
                    elif task.project_id is not None:
                        if is_both:
                            # Add to both AM and PM
                            if not _is_project_excluded(task.project_id, dept_user.id, day_date, "AM") and not _is_excluded(task.id, dept_user.id, day_date, "AM"):
                                if task.project_id not in am_projects_map:
                                    am_projects_map[task.project_id] = []
                                am_projects_map[task.project_id].append(task)
                            if not _is_project_excluded(task.project_id, dept_user.id, day_date, "PM") and not _is_excluded(task.id, dept_user.id, day_date, "PM"):
                                if task.project_id not in pm_projects_map:
                                    pm_projects_map[task.project_id] = []
                                pm_projects_map[task.project_id].append(task)
                        elif is_pm:
                            if not _is_project_excluded(task.project_id, dept_user.id, day_date, "PM") and not _is_excluded(task.id, dept_user.id, day_date, "PM"):
                                if task.project_id not in pm_projects_map:
                                    pm_projects_map[task.project_id] = []
                                pm_projects_map[task.project_id].append(task)
                        else:
                            # Default to AM if not PM and not both
                            if not _is_project_excluded(task.project_id, dept_user.id, day_date, "AM") and not _is_excluded(task.id, dept_user.id, day_date, "AM"):
                                if task.project_id not in am_projects_map:
                                    am_projects_map[task.project_id] = []
                                am_projects_map[task.project_id].append(task)
                
                # Add projects with due dates that don't have tasks yet
                # These projects should show for members even without tasks
                # If project already has tasks in map, keep those tasks
                for project_id in user_projects_with_due:
                    # Only add if not already in maps (from tasks above)
                    # If project already has tasks, we keep those tasks
                    # The project will show with its tasks on days with tasks,
                    # and without tasks (but still visible) on other days until due date
                    if project_id not in am_projects_map and project_id not in pm_projects_map:
                        # Default to AM if no tasks exist
                        if not _is_project_excluded(project_id, dept_user.id, day_date, "AM"):
                            am_projects_map[project_id] = []
                
                # Convert project maps to lists with task details
                # Include all projects, even if not in project_map (they'll show as "Unknown Project")
                am_projects: list[WeeklyTableProjectEntry] = []
                for project_id, tasks_list in am_projects_map.items():
                    am_projects.append(
                        WeeklyTableProjectEntry(
                            project_id=project_id,
                            project_title=project_map[project_id].title if project_id in project_map else "Unknown Project",
                            project_total_products=project_map[project_id].total_products if project_id in project_map else None,
                            task_count=len(tasks_list),
                            tasks=[
                                WeeklyTableProjectTaskEntry(
                                    task_id=t.id,
                                    task_title=t.title,
                                    status=TaskStatus(t.status) if t.status else TaskStatus.TODO,
                                    daily_status=(
                                        # For MST/TT tasks, find the most recent daily_status on or before the displayed day
                                        # This ensures we get the status from the day it was actually changed, not just the due_date
                                        next(
                                            (daily_progress_map[(t.id, check_date)] 
                                             for check_date in sorted(
                                                 [d for d in working_days if d <= day_date],
                                                 reverse=True
                                             )
                                             if (t.id, check_date) in daily_progress_map),
                                            TaskStatus.TODO  # Default if no record found
                                        )
                                        if t.id in mst_tt_task_ids
                                        else None
                                    ),
                                    completed_at=t.completed_at,
                                    daily_products=(
                                        t.daily_products
                                        if t.daily_products is not None
                                        else mst_tt_control_total_by_task_id.get(t.id)
                                    ),
                                    finish_period=t.finish_period,
                                    is_bllok=t.is_bllok,
                                    is_1h_report=t.is_1h_report,
                                    is_r1=t.is_r1,
                                    is_personal=t.is_personal,
                                    ga_note_origin_id=t.ga_note_origin_id,
                                )
                                for t in tasks_list
                            ],
                            is_late=False,
                        )
                    )
                pm_projects: list[WeeklyTableProjectEntry] = []
                for project_id, tasks_list in pm_projects_map.items():
                    pm_projects.append(
                        WeeklyTableProjectEntry(
                            project_id=project_id,
                            project_title=project_map[project_id].title if project_id in project_map else "Unknown Project",
                            project_total_products=project_map[project_id].total_products if project_id in project_map else None,
                            task_count=len(tasks_list),
                            tasks=[
                                WeeklyTableProjectTaskEntry(
                                    task_id=t.id,
                                    task_title=t.title,
                                    status=TaskStatus(t.status) if t.status else TaskStatus.TODO,
                                    daily_status=(
                                        # For MST/TT tasks, find the most recent daily_status on or before the displayed day
                                        # This ensures we get the status from the day it was actually changed, not just the due_date
                                        next(
                                            (daily_progress_map[(t.id, check_date)] 
                                             for check_date in sorted(
                                                 [d for d in working_days if d <= day_date],
                                                 reverse=True
                                             )
                                             if (t.id, check_date) in daily_progress_map),
                                            TaskStatus.TODO  # Default if no record found
                                        )
                                        if t.id in mst_tt_task_ids
                                        else None
                                    ),
                                    completed_at=t.completed_at,
                                    daily_products=(
                                        t.daily_products
                                        if t.daily_products is not None
                                        else mst_tt_control_total_by_task_id.get(t.id)
                                    ),
                                    finish_period=t.finish_period,
                                    is_bllok=t.is_bllok,
                                    is_1h_report=t.is_1h_report,
                                    is_r1=t.is_r1,
                                    is_personal=t.is_personal,
                                    ga_note_origin_id=t.ga_note_origin_id,
                                )
                                for t in tasks_list
                            ],
                            is_late=False,
                        )
                    )
                
                users_day_data.append(
                    WeeklyTableUserDay(
                        user_id=dept_user.id,
                        user_name=dept_user.full_name or dept_user.username or "",
                        am_projects=am_projects,
                        pm_projects=pm_projects,
                        am_system_tasks=am_system_tasks,
                        pm_system_tasks=pm_system_tasks,
                        am_fast_tasks=am_fast_tasks,
                        pm_fast_tasks=pm_fast_tasks,
                    )
                )
            
            days_data.append(
                WeeklyTableDay(
                    date=day_date,
                    users=users_day_data,
                )
            )
        
        departments_data.append(
            WeeklyTableDepartment(
                department_id=dept.id,
                department_name=dept.name,
                days=days_data,
            )
        )
    
    return WeeklyTableResponse(
        week_start=week_start_date,
        week_end=week_end,
        departments=departments_data,
        saved_plan_id=saved_plan_id,
    )


# Development department legend questions configuration
# Color mapping:
# - PINK = TO DO / New task
# - GREEN = KRYER / Done
# - RED = NUK ESHTE PUNUAR / Not worked
# - YELLOW = PROCES / In process
# - LIGHT GREY = PV
DEVELOPMENT_LEGEND_QUESTIONS = [
    {
        "key": "to_do",
        "label": "TO DO",
        "question_text": "A KEMI PROJEKTE TE TJERA TE P(A)PLANIFIKUARA?",
        "color": "#FF0000",  # Red
    },
    {
        "key": "kryer",
        "label": "KRYER",
        "question_text": "A PRITEN PROJEKTE TE TJERA GJATE JAVES QE DUHET ME I PLNF KETE JAVE, APO BARTEN JAVEN TJETER?",
        "color": "#C4FDC4",  # Green
    },
    {
        "key": "nuk_eshte_punuar",
        "label": "NUK ESHTE PUNUAR",
        "question_text": "BLOK?",
        "color": "#FFC4ED",  # Pink
    },
    {
        "key": "proces",
        "label": "PROCES",
        "question_text": "A PRITEN PROJEKTE TE TJERA GJATE JAVES QE DUHET ME I PLNF KETE JAVE, APO BARTEN JAVEN TJETER?",
        "color": "#FFD700",  # Yellow
    },
    {
        "key": "pv",
        "label": "PV",
        "question_text": "",
        "color": "#D3D3D3",  # Light Grey
    },
]

GRAPHIC_DESIGN_LEGEND_QUESTIONS = [
    {
        "key": "kryer",
        "label": "KRYER",
        "question_text": "A KEMI PROJEKTE TE TJERA TE PAPLANIFIKUARA?",
        "color": "#C4FDC4",  # Green
    },
    {
        "key": "nuk_eshte_punuar",
        "label": "NUK ESHTE PUNUAR",
        "question_text": "A KA KLIENT QE NUK KEMI PROJEKTE TE HAPURA?",
        "color": "#FFC4ED",  # Pink
    },
    {
        "key": "proces",
        "label": "PROCES",
        "question_text": "A PRITEN PROJEKTE TE TJERA GJATE JAVES QE DUHET ME I PLANIFIKU KETE JAVE, APO BARTEN JAVEN TJETER?",
        "color": "#FFD700",  # Yellow
    },
    {
        "key": "pv",
        "label": "PV",
        "question_text": "NENGARKESE (NUK ESHTE I PLANIFIKUAR PERSONI PER KOMPLET JAVEN)?",
        "color": "#D3D3D3",  # Light Grey
    },
    {
        "key": "mbingarkese",
        "label": "MBINGARKESE?",
        "question_text": "MBINGARKESE?",
        "color": "#D3D3D3",  # Light Grey
    },
    {
        "key": "komplet",
        "label": "KOMPLET (100% PROJEKTE)",
        "question_text": "KOMPLET (100% PROJEKTE)",
        "color": "#D3D3D3",  # Light Grey
    },
]

def normalize_department_key(name: str | None) -> str:
    return "".join((name or "").strip().lower().split())


LEGEND_QUESTION_SETS = {
    "development": DEVELOPMENT_LEGEND_QUESTIONS,
    "zhvillim": DEVELOPMENT_LEGEND_QUESTIONS,
    "graphicdesign": GRAPHIC_DESIGN_LEGEND_QUESTIONS,
    "grafikdizajn": GRAPHIC_DESIGN_LEGEND_QUESTIONS,
    "dizajngrafik": GRAPHIC_DESIGN_LEGEND_QUESTIONS,
    "productcontent": GRAPHIC_DESIGN_LEGEND_QUESTIONS,
    "produktcontent": GRAPHIC_DESIGN_LEGEND_QUESTIONS,
    "projectcontentmanager": GRAPHIC_DESIGN_LEGEND_QUESTIONS,
    "pcm": GRAPHIC_DESIGN_LEGEND_QUESTIONS,
}


@router.get("/weekly-planner/legend", response_model=list[WeeklyPlannerLegendEntryOut])
async def get_weekly_planner_legend(
    department_id: uuid.UUID,
    week_start: date,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[WeeklyPlannerLegendEntryOut]:
    """Get legend entries for a specific department and week. Auto-creates default entries for supported departments."""
    # Check department access
    ensure_department_access(user, department_id)
    
    # Get department to check if it's Development
    dept = (await db.execute(select(Department).where(Department.id == department_id))).scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    
    legend_questions = LEGEND_QUESTION_SETS.get(normalize_department_key(dept.name))
    if not legend_questions and getattr(dept, "code", None):
        legend_questions = LEGEND_QUESTION_SETS.get(normalize_department_key(dept.code))
    if not legend_questions:
        return []
    
    # Get existing entries
    stmt = select(WeeklyPlannerLegendEntry).where(
        WeeklyPlannerLegendEntry.department_id == department_id,
        WeeklyPlannerLegendEntry.week_start_date == week_start,
    )
    existing_entries = (await db.execute(stmt.order_by(WeeklyPlannerLegendEntry.key))).scalars().all()
    
    existing_by_key = {entry.key: entry for entry in existing_entries}
    new_entries = []

    for question in legend_questions:
        if question["key"] in existing_by_key:
            continue
        entry = WeeklyPlannerLegendEntry(
            department_id=department_id,
            week_start_date=week_start,
            key=question["key"],
            label=question["label"],
            question_text=question["question_text"],
            answer_text=None,
            created_by=user.id,
        )
        db.add(entry)
        new_entries.append(entry)

    if new_entries:
        await db.commit()
        for entry in new_entries:
            await db.refresh(entry)
        existing_entries.extend(new_entries)

    if not existing_entries:
        return []

    return [WeeklyPlannerLegendEntryOut.model_validate(entry) for entry in existing_entries]


@router.patch("/weekly-planner/legend/{entry_id}", response_model=WeeklyPlannerLegendEntryOut)
async def update_weekly_planner_legend_entry(
    entry_id: uuid.UUID,
    payload: WeeklyPlannerLegendEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> WeeklyPlannerLegendEntryOut:
    """Update the answer_text for a legend entry."""
    entry = (await db.execute(
        select(WeeklyPlannerLegendEntry).where(WeeklyPlannerLegendEntry.id == entry_id)
    )).scalar_one_or_none()
    
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Legend entry not found")
    
    # Check department access
    ensure_department_access(user, entry.department_id)
    
    # Update answer_text - handle both None and empty string as null
    # This allows clearing the field by sending empty string or null
    if payload.answer_text is not None:
        # Trim whitespace and set to None if empty
        answer_text = payload.answer_text.strip() if payload.answer_text else None
        entry.answer_text = answer_text if answer_text else None
    else:
        # Explicitly set to None if payload.answer_text is None
        entry.answer_text = None
    
    await db.commit()
    await db.refresh(entry)
    
    return WeeklyPlannerLegendEntryOut.model_validate(entry)

