from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.schemas.task import TaskOut


class WeeklyPlannerDay(BaseModel):
    date: date
    tasks: list[TaskOut]


class WeeklyPlannerResponse(BaseModel):
    week_start: date
    week_end: date
    overdue: list[TaskOut]
    days: list[WeeklyPlannerDay]


class MonthlyPlannerSummary(BaseModel):
    month_completed: int
    previous_month_completed: int


class MonthlyPlannerResponse(BaseModel):
    month_start: date
    month_end: date
    tasks: list[TaskOut]
    milestones: list[TaskOut]
    recurring: list[TaskOut]
    summary: MonthlyPlannerSummary

