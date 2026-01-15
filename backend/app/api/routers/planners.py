from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import ProjectPhaseStatus, TaskFinishPeriod, TaskPriority, TaskStatus, UserRole
from app.models.project import Project
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.models.weekly_plan import WeeklyPlan
from app.models.department import Department
from app.schemas.planner import (
    MonthlyPlannerResponse,
    MonthlyPlannerSummary,
    WeeklyPlannerDay,
    WeeklyPlannerProject,
    WeeklyPlannerResponse,
    WeeklyTableDay,
    WeeklyTableDepartment,
    WeeklyTableProjectEntry,
    WeeklyTableResponse,
    WeeklyTableTaskEntry,
    WeeklyTableUserDay,
)
from app.schemas.project import ProjectOut
from app.schemas.task import TaskAssigneeOut, TaskOut
from app.schemas.weekly_plan import WeeklyPlanCreate, WeeklyPlanOut, WeeklyPlanUpdate


router = APIRouter()


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _month_range(year: int, month: int) -> tuple[date, date]:
    month_start = date(year, month, 1)
    next_month = date(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1)
    return month_start, next_month - timedelta(days=1)


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
        project_type=project_type_enum,
        current_phase=phase_enum,
        status=status_enum,
        progress_percentage=p.progress_percentage,
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
    # If not provided (None), admins can see all, others see their department
    if department_id is not None:
        ensure_department_access(user, department_id)
    elif user.role != UserRole.ADMIN:
        # Non-admin users without department_id should see their own department
        department_id = user.department_id

    # Get active projects (not completed, not templates)
    project_stmt = select(Project).where(
        Project.completed_at.is_(None),
        Project.is_template == False,
    )
    if department_id is not None:
        project_stmt = project_stmt.where(Project.department_id == department_id)
    projects = (await db.execute(project_stmt.order_by(Project.created_at))).scalars().all()

    # Get all active tasks (not completed)
    task_stmt = select(Task).where(Task.completed_at.is_(None), Task.is_active == True)
    if department_id is not None:
        task_stmt = task_stmt.where(Task.department_id == department_id)
    if user_id is not None:
        task_stmt = task_stmt.where(Task.assigned_to == user_id)
    
    all_tasks = (await db.execute(task_stmt.order_by(Task.due_date.nullsfirst(), Task.created_at))).scalars().all()
    
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

    # Filter tasks for next week (due_date in working days range, or no due_date for active tasks)
    # Convert working days to datetime for comparison
    week_start_datetime = datetime.combine(working_days[0], datetime.min.time()).replace(tzinfo=timezone.utc)
    week_end_datetime = datetime.combine(working_days[-1], datetime.max.time()).replace(tzinfo=timezone.utc)
    
    # Get tasks that are due in the next week OR have no due_date (active tasks)
    week_tasks = []
    for t in all_tasks:
        if t.due_date is not None:
            # Task has a due date - check if it's in the working days range
            due_date_only = t.due_date.date()
            if working_days[0] <= due_date_only <= working_days[-1]:
                week_tasks.append(t)
        elif t.is_active:
            # Task has no due date but is active - include it
            week_tasks.append(t)
    
    # Overdue tasks (due_date before week start)
    overdue = [
        _task_to_out(t, assignee_map.get(t.id, []))
        for t in all_tasks
        if t.due_date is not None and t.due_date.date() < working_days[0]
    ]

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

    # Fast tasks (tasks without project_id)
    fast_tasks = [
        _task_to_out(t, assignee_map.get(t.id, []))
        for t in week_tasks
        if t.project_id is None
    ]

    # Organize tasks by day for the days view
    days: list[WeeklyPlannerDay] = []
    for d in working_days:
        day_datetime = datetime.combine(d, datetime.min.time()).replace(tzinfo=timezone.utc)
        day_tasks = [
            _task_to_out(t, assignee_map.get(t.id, []))
            for t in week_tasks
            if t.due_date is not None and t.due_date.date() == d
        ]
        # Add tasks without due_date to first day
        if d == working_days[0]:
            day_tasks.extend([
                _task_to_out(t, assignee_map.get(t.id, []))
                for t in week_tasks
                if t.due_date is None
            ])
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
    elif user.role != UserRole.ADMIN:
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
    elif user.role != UserRole.ADMIN:
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
    elif user.role != UserRole.ADMIN:
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
    elif user.role != UserRole.ADMIN:
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
    elif user.role != UserRole.ADMIN:
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
    
    # Check if there's a saved plan for this week
    saved_plan_id: uuid.UUID | None = None
    if department_id is not None:
        plan_stmt = select(WeeklyPlan).where(
            WeeklyPlan.department_id == department_id,
            WeeklyPlan.start_date == week_start_date,
        )
        saved_plan = (await db.execute(plan_stmt)).scalar_one_or_none()
        if saved_plan:
            saved_plan_id = saved_plan.id
    
    # Get departments to show
    if user.role == UserRole.STAFF:
        department_id = user.department_id
    
    dept_stmt = select(Department)
    if department_id is not None:
        ensure_department_access(user, department_id)
        dept_stmt = dept_stmt.where(Department.id == department_id)
    elif user.role != UserRole.ADMIN:
        if user.department_id is not None:
            dept_stmt = dept_stmt.where(Department.id == user.department_id)
        else:
            return WeeklyTableResponse(
                week_start=week_start_date,
                week_end=week_end,
                departments=[],
                saved_plan_id=saved_plan_id,
            )
    
    departments = (await db.execute(dept_stmt.order_by(Department.name))).scalars().all()
    
    # Identify Design and PCM departments that should show all tasks
    design_dept_names = {"Graphic Design", "Project Content Manager"}
    design_dept_ids = {dept.id for dept in departments if dept.name in design_dept_names}
    
    # Get all users - we need all users for Design/PCM departments
    # If viewing all departments or Design/PCM, get all users; otherwise filter by department
    users_stmt = select(User).where(User.is_active == True)
    if department_id is not None and department_id not in design_dept_ids:
        users_stmt = users_stmt.where(User.department_id == department_id)
    all_users = (await db.execute(users_stmt.order_by(User.full_name))).scalars().all()
    
    # Get active projects (not completed, not templates)
    # For Design/PCM, we need all projects to show all tasks
    project_stmt = select(Project).where(
        Project.completed_at.is_(None),
        Project.is_template == False,
    )
    if department_id is not None and department_id not in design_dept_ids:
        project_stmt = project_stmt.where(Project.department_id == department_id)
    projects = (await db.execute(project_stmt.order_by(Project.created_at))).scalars().all()
    project_map = {p.id: p for p in projects}
    
    # Get all active tasks (not completed)
    # For Design/PCM, we need all tasks from all departments
    task_stmt = select(Task).where(Task.completed_at.is_(None), Task.is_active == True)
    if department_id is not None and department_id not in design_dept_ids:
        task_stmt = task_stmt.where(Task.department_id == department_id)
    all_tasks = (await db.execute(task_stmt.order_by(Task.due_date.nullsfirst(), Task.created_at))).scalars().all()
    
    # Filter tasks for the week
    week_tasks = []
    task_project_ids = set()
    for t in all_tasks:
        if t.due_date is not None:
            due_date_only = t.due_date.date()
            if working_days[0] <= due_date_only <= working_days[-1]:
                week_tasks.append(t)
                if t.project_id is not None:
                    task_project_ids.add(t.project_id)
        elif t.is_active:
            # Include active tasks without due_date
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
    
    # Build table structure: Departments -> Days -> Users -> AM/PM
    departments_data: list[WeeklyTableDepartment] = []
    
    # Debug: Log task counts
    logger = logging.getLogger(__name__)
    logger.debug(f"Weekly planner: Found {len(week_tasks)} tasks for week {week_start_date} to {week_end}")
    
    for dept in departments:
        # For Design and PCM departments, show all tasks and all users (same as Development)
        if dept.id in design_dept_ids:
            dept_users = all_users  # All users from all departments
            dept_tasks = week_tasks  # All tasks from all departments
        else:
            dept_users = [u for u in all_users if u.department_id == dept.id]
            dept_tasks = [t for t in week_tasks if t.department_id == dept.id]
        
        # Organize tasks by day and user
        days_data: list[WeeklyTableDay] = []
        
        for day_date in working_days:
            users_day_data: list[WeeklyTableUserDay] = []
            
            for dept_user in dept_users:
                # Get tasks for this user on this day
                user_task_ids = set()
                for t in dept_tasks:
                    # Check if task is assigned to this user
                    if t.assigned_to == dept_user.id:
                        user_task_ids.add(t.id)
                    # Check assignees
                    assignees = assignee_map.get(t.id, [])
                    if any(a.id == dept_user.id for a in assignees):
                        user_task_ids.add(t.id)
                
                # Filter tasks for this day:
                # - Tasks with due_date: only if due_date matches this day
                # - Tasks without due_date: only show on the first day
                user_tasks = [
                    t for t in dept_tasks
                    if t.id in user_task_ids and (
                        (t.due_date is not None and t.due_date.date() == day_date) or
                        (t.due_date is None and day_date == working_days[0])
                    )
                ]
                
                # Debug: Log user tasks found
                if user_tasks:
                    logger.debug(f"User {dept_user.full_name} on {day_date}: {len(user_tasks)} tasks")
                
                # Separate tasks by type: projects, system tasks, fast tasks
                # And split by AM/PM based on finish_period
                am_projects_map: dict[uuid.UUID, int] = {}
                pm_projects_map: dict[uuid.UUID, int] = {}
                am_system_tasks: list[WeeklyTableTaskEntry] = []
                pm_system_tasks: list[WeeklyTableTaskEntry] = []
                am_fast_tasks: list[WeeklyTableTaskEntry] = []
                pm_fast_tasks: list[WeeklyTableTaskEntry] = []
                
                for task in user_tasks:
                    # Handle finish_period: None or empty defaults to AM
                    is_pm = task.finish_period and str(task.finish_period).upper() == "PM"
                    
                    # System tasks (have system_template_origin_id)
                    if task.system_template_origin_id is not None:
                        entry = WeeklyTableTaskEntry(
                            task_id=task.id,
                            title=task.title,
                        )
                        if is_pm:
                            pm_system_tasks.append(entry)
                        else:
                            am_system_tasks.append(entry)
                    # Fast tasks (no project_id and no system_template_origin_id)
                    elif task.project_id is None:
                        entry = WeeklyTableTaskEntry(
                            task_id=task.id,
                            title=task.title,
                        )
                        if is_pm:
                            pm_fast_tasks.append(entry)
                        else:
                            am_fast_tasks.append(entry)
                    # Project tasks (have project_id)
                    elif task.project_id is not None:
                        if is_pm:
                            pm_projects_map[task.project_id] = pm_projects_map.get(task.project_id, 0) + 1
                        else:
                            am_projects_map[task.project_id] = am_projects_map.get(task.project_id, 0) + 1
                
                # Convert project maps to lists
                # Include all projects, even if not in project_map (they'll show as "Unknown Project")
                am_projects: list[WeeklyTableProjectEntry] = [
                    WeeklyTableProjectEntry(
                        project_id=project_id,
                        project_title=project_map[project_id].title if project_id in project_map else "Unknown Project",
                        task_count=count,
                    )
                    for project_id, count in am_projects_map.items()
                ]
                pm_projects: list[WeeklyTableProjectEntry] = [
                    WeeklyTableProjectEntry(
                        project_id=project_id,
                        project_title=project_map[project_id].title if project_id in project_map else "Unknown Project",
                        task_count=count,
                    )
                    for project_id, count in pm_projects_map.items()
                ]
                
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

