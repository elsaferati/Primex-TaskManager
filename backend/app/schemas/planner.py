from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.project import ProjectOut
from app.schemas.task import TaskOut
from app.models.enums import TaskStatus


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
    status: TaskStatus = TaskStatus.TODO
    completed_at: datetime | None = None
    daily_products: int | None = None
    finish_period: str | None = None
    is_bllok: bool = False
    is_1h_report: bool = False
    is_r1: bool = False
    is_personal: bool = False
    ga_note_origin_id: uuid.UUID | None = None


class WeeklyTableProjectEntry(BaseModel):
    """A project entry in the weekly table"""
    project_id: uuid.UUID
    project_title: str
    project_total_products: int | None = None
    task_count: int = 0
    tasks: list[WeeklyTableProjectTaskEntry] = []
    is_late: bool = False


class WeeklyTableTaskEntry(BaseModel):
    """A task entry (for system/fast tasks) in the weekly table"""
    task_id: uuid.UUID | None = None
    title: str
    status: TaskStatus = TaskStatus.TODO
    completed_at: datetime | None = None
    daily_products: int | None = None
    finish_period: str | None = None
    fast_task_type: str | None = None
    is_bllok: bool = False
    is_1h_report: bool = False
    is_r1: bool = False
    is_personal: bool = False
    ga_note_origin_id: uuid.UUID | None = None


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


class WeeklyPlannerLegendEntryOut(BaseModel):
    """Legend entry for weekly planner questions"""
    id: uuid.UUID
    department_id: uuid.UUID
    week_start_date: date
    key: str
    label: str
    question_text: str
    answer_text: str | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WeeklyPlannerLegendEntryUpdate(BaseModel):
    """Update payload for legend entry answer"""
    answer_text: str | None = None