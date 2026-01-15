from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel


class WeeklyPlanTaskEntry(BaseModel):
    """A task entry in the weekly plan for a specific user, day, and time slot"""
    task_id: uuid.UUID | None = None
    title: str
    project_id: uuid.UUID | None = None
    project_title: str | None = None


class WeeklyPlanUserDay(BaseModel):
    """Tasks for a user on a specific day"""
    user_id: uuid.UUID
    user_name: str
    am_tasks: list[WeeklyPlanTaskEntry] = []
    pm_tasks: list[WeeklyPlanTaskEntry] = []


class WeeklyPlanDay(BaseModel):
    """Plan for a specific day"""
    date: date
    users: list[WeeklyPlanUserDay] = []


class WeeklyPlanContent(BaseModel):
    """Structure of the weekly plan content"""
    days: list[WeeklyPlanDay] = []


class WeeklyPlanOut(BaseModel):
    id: uuid.UUID
    department_id: uuid.UUID | None = None
    start_date: date
    end_date: date
    content: dict | None = None
    is_finalized: bool
    created_by: uuid.UUID | None = None
    created_at: datetime


class WeeklyPlanCreate(BaseModel):
    department_id: uuid.UUID | None = None
    start_date: date
    end_date: date
    content: dict | None = None
    is_finalized: bool | None = None
    created_by: uuid.UUID | None = None


class WeeklyPlanUpdate(BaseModel):
    content: dict | None = None
    is_finalized: bool | None = None

