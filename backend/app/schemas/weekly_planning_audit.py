from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import BaseModel, EmailStr, Field, field_validator


class WeeklyPlanningAuditGenerateIn(BaseModel):
    week_start: date | None = None
    slot: str = "09:00"

    @field_validator("slot")
    @classmethod
    def validate_slot(cls, value: str) -> str:
        if value not in {"09:00", "09:30", "10:00", "10:30", "11:00"}:
            raise ValueError("Unsupported audit slot")
        return value


class WeeklyPlanningAuditSendIn(BaseModel):
    report_run_id: uuid.UUID


class WeeklyPlanningAuditSettingsPatch(BaseModel):
    enabled: bool | None = None
    timezone: str | None = None
    recipients_to: list[EmailStr] | None = None
    recipients_cc: list[EmailStr] | None = None
    recipients_bcc: list[EmailStr] | None = None
    retention_days: int | None = Field(default=None, ge=1, le=3650)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value:
            try:
                ZoneInfo(value)
            except Exception as exc:
                raise ValueError("Unknown timezone") from exc
        return value


class WeeklyPlanningAuditSettingsOut(BaseModel):
    id: uuid.UUID
    enabled: bool
    timezone: str
    recipients_to: list[str]
    recipients_cc: list[str]
    recipients_bcc: list[str]
    schedule_config: dict[str, Any]
    recipient_config_version: int
    abbreviation_version: str
    retention_days: int
    updated_at: datetime


class WeeklyPlanningAuditRunOut(BaseModel):
    id: uuid.UUID
    week_start: date
    week_end: date
    slot: str
    generated_at: datetime | None
    generated_by: uuid.UUID | None
    trigger_type: str
    status: str
    included_user_count: int
    excluded_leave_count: int
    error_count: int
    critical_count: int
    high_count: int
    filename: str | None
    file_checksum: str | None
    recipients_snapshot: dict[str, list[str]]
    subject: str | None
    message_id: str | None
    attempt_count: int
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    download_url: str | None = None


class WeeklyPlanningAuditPreviewOut(BaseModel):
    week_start: date
    week_end: date
    generated_at: datetime
    timezone: str
    slot: str
    people: list[dict[str, Any]]
    errors: list[dict[str, Any]]
    title_cleanup: list[dict[str, Any]]
    excluded_full_leave: list[str]
    partial_leave_users: list[str]
    abbreviation_version: str
    ai_status: str
    ai_model: str | None = None


class WeeklyPlanningAuditHistoryOut(BaseModel):
    items: list[WeeklyPlanningAuditRunOut]


class WeeklyPlanningAuditAbbreviationImportOut(BaseModel):
    version: str
    entry_count: int
