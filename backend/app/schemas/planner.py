from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel

from app.schemas.project import ProjectOut
from app.schemas.task import TaskOut


class WeeklyPlannerDay(BaseModel):
    date: date
    tasks: list[TaskOut]


class WeeklyPlannerProject(BaseModel):
    project: ProjectOut
    tasks: list[TaskOut]


class WeeklyPlannerResponse(BaseModel):
    week_start: date
    week_end: date
    overdue: list[TaskOut]
    projects: list[WeeklyPlannerProject]
    fast_tasks: list[TaskOut]
    days: list[WeeklyPlannerDay]


class WeeklyTableProjectTaskEntry(BaseModel):
    """A task within a project entry in the weekly table"""
    task_id: uuid.UUID
    task_title: str
    daily_products: int | None = None


class WeeklyTableProjectEntry(BaseModel):
    """A project entry in the weekly table"""
    project_id: uuid.UUID
    project_title: str
    project_total_products: int | None = None
    task_count: int = 0
    tasks: list[WeeklyTableProjectTaskEntry] = []


class WeeklyTableTaskEntry(BaseModel):
    """A task entry (for system/fast tasks) in the weekly table"""
    task_id: uuid.UUID | None = None
    title: str
    daily_products: int | None = None


class WeeklyTableUserDay(BaseModel):
    """Items for a user on a specific day and time slot"""
    user_id: uuid.UUID
    user_name: str
    am_projects: list[WeeklyTableProjectEntry] = []
    pm_projects: list[WeeklyTableProjectEntry] = []
    am_system_tasks: list[WeeklyTableTaskEntry] = []
    pm_system_tasks: list[WeeklyTableTaskEntry] = []
    am_fast_tasks: list[WeeklyTableTaskEntry] = []
    pm_fast_tasks: list[WeeklyTableTaskEntry] = []


class WeeklyTableDay(BaseModel):
    """Plan for a specific day"""
    date: date
    users: list[WeeklyTableUserDay] = []


class WeeklyTableDepartment(BaseModel):
    """Weekly plan for a department"""
    department_id: uuid.UUID
    department_name: str
    days: list[WeeklyTableDay] = []


class WeeklyTableResponse(BaseModel):
    """Table-structured weekly planner response"""
    week_start: date
    week_end: date
    departments: list[WeeklyTableDepartment]
    saved_plan_id: uuid.UUID | None = None


class MonthlyPlannerSummary(BaseModel):
    month_completed: int
    previous_month_completed: int


class MonthlyPlannerResponse(BaseModel):
    month_start: date
    month_end: date
    tasks: list[TaskOut]
    recurring: list[TaskOut]
    summary: MonthlyPlannerSummary


