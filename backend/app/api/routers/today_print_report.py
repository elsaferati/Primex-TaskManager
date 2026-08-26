from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_admin
from app.models.today_print_report_delivery import TodayPrintReportDelivery
from app.models.today_print_report_settings import TodayPrintReportSettings
from app.models.user import User
from app.services.meetings_report_scheduler import normalize_recipients
from app.services.primeflow_report import report_timezone
from app.services.tomorrow_print_report import (
    REQUIRED_SHTYPI_RECIPIENTS,
    build_today_print_report,
    ensure_required_shtypi_recipient,
    send_tomorrow_print_report,
)

router = APIRouter()
DEFAULT_RECIPIENTS = {
    "to": ["ga@primexeu.com", *REQUIRED_SHTYPI_RECIPIENTS], "cc": [], "bcc": []
}


class RecipientsPayload(BaseModel):
    to: list[str] = Field(default_factory=list)
    cc: list[str] = Field(default_factory=list)
    bcc: list[str] = Field(default_factory=list)


class SettingsPayload(BaseModel):
    is_active: bool
    send_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    timezone: str = Field(default="Europe/Tirane", min_length=1, max_length=80)
    weekdays: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])
    recipients: RecipientsPayload


def _settings(row: TodayPrintReportSettings) -> dict:
    return {
        "is_active": row.is_active,
        "send_time": row.send_time.strftime("%H:%M"),
        "timezone": row.timezone,
        "weekdays": row.weekdays or [],
        "recipients": ensure_required_shtypi_recipient(normalize_recipients(row.recipients)),
        "last_run_date": row.last_run_date.isoformat() if row.last_run_date else None,
    }


def _history(row: TodayPrintReportDelivery) -> dict:
    return {
        "id": str(row.id),
        "delivery_date": row.delivery_date.isoformat(),
        "target_date": row.target_date.isoformat(),
        "subject": row.subject,
        "recipients": normalize_recipients(row.recipients),
        "status": row.status,
        "sent_at": row.sent_at.isoformat() if row.sent_at else None,
        "last_error": row.last_error,
    }


def _parse_time(value: str) -> time:
    try:
        return datetime.strptime(value, "%H:%M").time()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Send time must be a valid HH:MM value") from exc


async def _settings_row(db: AsyncSession) -> TodayPrintReportSettings:
    row = (
        await db.execute(select(TodayPrintReportSettings).order_by(TodayPrintReportSettings.created_at.asc()))
    ).scalars().first()
    if row is None:
        row = TodayPrintReportSettings(
            send_time=time(9, 0), weekdays=[0, 1, 2, 3, 4], recipients=DEFAULT_RECIPIENTS
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> dict:
    return _settings(await _settings_row(db))


@router.put("/settings")
async def update_settings(
    payload: SettingsPayload, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
) -> dict:
    if any(day < 0 or day > 6 for day in payload.weekdays):
        raise HTTPException(status_code=400, detail="Weekdays must be numbers from 0 to 6")
    try:
        ZoneInfo(payload.timezone)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(status_code=400, detail="Timezone is not valid") from exc
    row = await _settings_row(db)
    row.is_active = payload.is_active
    row.send_time = _parse_time(payload.send_time)
    row.timezone = payload.timezone
    row.weekdays = sorted(set(payload.weekdays))
    row.recipients = ensure_required_shtypi_recipient(
        normalize_recipients(payload.recipients.model_dump())
    )
    await db.commit()
    await db.refresh(row)
    return _settings(row)


@router.get("/preview")
async def preview(report_date: date | None = None, _: User = Depends(require_admin)) -> dict:
    target_date = report_date or datetime.now(report_timezone()).date()
    return await build_today_print_report(target_date)


@router.get("/print-preview")
async def print_preview(
    report_date: date | None = None, _: User = Depends(get_current_user)
) -> dict:
    """Return the canonical Today report for printing from Common View."""
    target_date = report_date or datetime.now(report_timezone()).date()
    return await build_today_print_report(target_date)


@router.post("/send")
async def send(
    report_date: date | None = None, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
) -> dict:
    delivery_date = report_date or datetime.now(report_timezone()).date()
    settings = await _settings_row(db)
    recipients = ensure_required_shtypi_recipient(normalize_recipients(settings.recipients))
    if not recipients["to"]:
        raise HTTPException(status_code=400, detail="Add at least one To recipient before sending")
    existing = (
        await db.execute(
            select(TodayPrintReportDelivery).where(TodayPrintReportDelivery.delivery_date == delivery_date)
        )
    ).scalar_one_or_none()
    report = await build_today_print_report(delivery_date, include_attachment=True)
    if existing is None:
        existing = TodayPrintReportDelivery(
            delivery_date=delivery_date,
            target_date=delivery_date,
            subject=report["subject"],
            recipients=recipients,
        )
        db.add(existing)
    else:
        # "Send now" is an explicit resend. Automatic delivery remains
        # idempotent in the scheduler, but the manual action must not silently
        # return an older SENT history row without sending a new message.
        existing.status = "PENDING"
        existing.last_error = None
    try:
        message = await send_tomorrow_print_report(report, recipients)
    except Exception as exc:
        existing.status = "FAILED"
        existing.last_error = str(exc)[:2000]
        await db.commit()
        raise HTTPException(status_code=502, detail="Email delivery failed") from exc
    existing.subject = report["subject"]
    existing.recipients = recipients
    existing.status = "SENT"
    existing.sent_at = datetime.now(report_timezone())
    existing.gmail_message_id = message.get("id")
    existing.gmail_thread_id = message.get("threadId")
    existing.last_error = None
    settings.last_run_date = existing.sent_at
    await db.commit()
    await db.refresh(existing)
    return _history(existing)


@router.get("/history")
async def history(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)) -> list[dict]:
    rows = (
        await db.execute(
            select(TodayPrintReportDelivery).order_by(TodayPrintReportDelivery.created_at.desc()).limit(50)
        )
    ).scalars().all()
    return [_history(row) for row in rows]
