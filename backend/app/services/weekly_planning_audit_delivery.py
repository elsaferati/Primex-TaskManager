from __future__ import annotations

import hashlib
import logging
import os
import tempfile
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import SessionLocal
from app.models.weekly_planning_audit import (
    WeeklyPlanningAuditDelivery,
    WeeklyPlanningAuditRun,
    WeeklyPlanningAuditSettings,
)
from app.services.primeflow_report import GmailService
from app.services.weekly_planning_audit import (
    build_weekly_planning_audit,
    normalize_week_start,
)
from app.services.weekly_planning_audit_excel import (
    build_weekly_planning_audit_workbook,
    report_filename,
    report_subject,
    update_weekly_planning_audit_delivery_metadata,
)


logger = logging.getLogger(__name__)
REPORT_TYPE = "weekly_planning_audit"
SCHEDULED = "SCHEDULED"
MANUAL = "MANUAL"
APPROVED_SLOT = "10:30"
REQUIRED_RECIPIENTS = (
    "130primex.eu@gmail.com",
    "info@primexeu.com",
    "ga@primexeu.com",
)


class WeeklyPlanningAuditEmailError(RuntimeError):
    pass


def _environment_recipients() -> list[str]:
    configured = [
        value.strip()
        for value in settings.WEEKLY_PLANNING_AUDIT_RECIPIENTS.split(",")
        if value.strip()
    ]
    return list(dict.fromkeys([*configured, *REQUIRED_RECIPIENTS]))


async def get_or_create_settings(db: AsyncSession) -> WeeklyPlanningAuditSettings:
    row = (await db.execute(
        select(WeeklyPlanningAuditSettings).order_by(WeeklyPlanningAuditSettings.created_at).limit(1)
    )).scalar_one_or_none()
    if row is not None:
        approved_schedule = {"weekday": "friday", "slots": ["10:30"]}
        approved_recipients = list(dict.fromkeys([*(row.recipients_to or []), *REQUIRED_RECIPIENTS]))
        changed = False
        if row.schedule_config != approved_schedule:
            row.schedule_config = approved_schedule
            changed = True
        if row.recipients_to != approved_recipients:
            row.recipients_to = approved_recipients
            changed = True
        if changed:
            row.recipient_config_version += 1
            await db.flush()
        return row
    row = WeeklyPlanningAuditSettings(
        enabled=settings.WEEKLY_PLANNING_AUDIT_ENABLED,
        timezone=settings.WEEKLY_PLANNING_AUDIT_TIMEZONE,
        recipients_to=_environment_recipients(),
        recipients_cc=[],
        recipients_bcc=[],
        schedule_config={
            "weekday": "friday",
            "slots": ["10:30"],
        },
        recipient_config_version=1,
        abbreviation_version="2026.1",
        retention_days=settings.REPORT_RETENTION_DAYS,
    )
    db.add(row)
    await db.flush()
    return row


def recipient_snapshot(config: WeeklyPlanningAuditSettings) -> dict[str, list[str]]:
    return {
        "to": list(config.recipients_to or []),
        "cc": list(config.recipients_cc or []),
        "bcc": list(config.recipients_bcc or []),
    }


def scheduled_idempotency_key(
    *, week_start: date, slot: str, recipient_config_version: int
) -> str:
    return f"{REPORT_TYPE}|{week_start.isoformat()}|{slot}|v{recipient_config_version}"


def build_delivery_record(
    run: WeeklyPlanningAuditRun,
    *,
    requested_by: uuid.UUID | None,
    resend: bool,
    attempt: int,
) -> WeeklyPlanningAuditDelivery:
    return WeeklyPlanningAuditDelivery(
        report_run_id=run.id,
        delivery_type="RESEND" if resend else "INITIAL",
        status="SENDING",
        recipients=run.recipients_snapshot,
        attempt_number=attempt,
        attachment_filename=run.filename,
        report_checksum=run.file_checksum,
        requested_by=requested_by,
    )


def stable_smtp_message_id(
    *,
    run_id: uuid.UUID,
    delivery_id: uuid.UUID,
    resend: bool,
    sender_domain: str,
) -> str:
    identity = delivery_id if resend else run_id
    return f"weekly-planning-audit-{identity}@{sender_domain}"


def record_delivery_failure(
    delivery: WeeklyPlanningAuditDelivery,
    run: WeeklyPlanningAuditRun,
    exc: Exception,
) -> None:
    message = str(exc)[:4000]
    delivery.status = "FAILED"
    delivery.error_message = message
    run.status = "FAILED"
    run.error_message = message


def _storage_root() -> Path:
    return Path(settings.REPORT_STORAGE_DIR).expanduser().resolve()


def _safe_run_path(run_id: uuid.UUID, filename: str) -> Path:
    root = _storage_root()
    target_dir = (root / str(run_id)).resolve()
    if target_dir != root and root not in target_dir.parents:
        raise RuntimeError("Invalid report storage target")
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir / filename


def _write_atomic(path: Path, content: bytes) -> None:
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".weekly-audit-", suffix=".tmp", delete=False) as handle:
        handle.write(content)
        temporary_path = Path(handle.name)
    os.replace(temporary_path, path)


async def generate_report_run(
    db: AsyncSession,
    *,
    week_start: date | None,
    slot: str,
    trigger_type: str,
    generated_by: uuid.UUID | None,
) -> WeeklyPlanningAuditRun:
    if slot != APPROVED_SLOT:
        raise ValueError(f"Unsupported audit slot: {slot}; approved slot is {APPROVED_SLOT}")
    config = await get_or_create_settings(db)
    normalized_start = normalize_week_start(week_start, config.timezone)
    if trigger_type == SCHEDULED and not config.enabled:
        raise ValueError("Weekly planning audit delivery is disabled")
    recipients = recipient_snapshot(config)
    if not recipients["to"]:
        raise ValueError("At least one To recipient must be configured")

    idempotency_key = (
        scheduled_idempotency_key(
            week_start=normalized_start,
            slot=slot,
            recipient_config_version=config.recipient_config_version,
        )
        if trigger_type == SCHEDULED else None
    )
    if idempotency_key:
        await db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
            {"key": idempotency_key},
        )
        existing = (await db.execute(
            select(WeeklyPlanningAuditRun)
            .where(WeeklyPlanningAuditRun.idempotency_key == idempotency_key)
            .with_for_update()
        )).scalar_one_or_none()
        if existing is not None:
            return existing

    run = WeeklyPlanningAuditRun(
        week_start=normalized_start,
        week_end=normalized_start + timedelta(days=4),
        slot=slot,
        generated_by=generated_by,
        trigger_type=trigger_type,
        status="GENERATING",
        recipients_snapshot=recipients,
        recipient_config_version=config.recipient_config_version,
        idempotency_key=idempotency_key,
    )
    db.add(run)
    await db.flush()

    abbreviation_override = config.abbreviation_dictionary or None
    try:
        report = await build_weekly_planning_audit(
            db,
            week_start=normalized_start,
            slot=slot,
            timezone_name=config.timezone,
            abbreviation_override=abbreviation_override,
            abbreviation_version=config.abbreviation_version,
        )
        filename = report_filename(report)
        workbook = build_weekly_planning_audit_workbook(
            report,
            recipients=recipients,
            run_id=str(run.id),
            message_id=None,
        )
        checksum = hashlib.sha256(workbook).hexdigest()
        path = _safe_run_path(run.id, filename)
        _write_atomic(path, workbook)
        run.generated_at = report.generated_at
        run.status = "GENERATED"
        run.included_user_count = len(report.people)
        run.excluded_leave_count = len(report.excluded_full_leave)
        run.error_count = len(report.errors)
        run.critical_count = sum(item.severity == "CRITICAL" for item in report.errors)
        run.high_count = sum(item.severity == "HIGH" for item in report.errors)
        run.filename = filename
        run.file_checksum = checksum
        run.storage_path = str(path)
        run.subject = report_subject(report)
        run.report_payload = report.to_dict()
        await db.flush()
        logger.info(
            "weekly_planning_audit_generated run_id=%s week_start=%s slot=%s errors=%s checksum=%s",
            run.id, normalized_start, slot, run.error_count, checksum,
        )
        return run
    except Exception as exc:
        run.status = "FAILED"
        run.error_message = str(exc)[:4000]
        await db.commit()
        raise


def _email_body_from_run(run: WeeklyPlanningAuditRun) -> str:
    return (
        "Përshëndetje,\n\n"
        "Bashkëngjitur është raporti aktual i kontrollit të planifikimit javor në PrimeFlow "
        f"për javën {run.week_start:%d.%m.%Y}–{run.week_end:%d.%m.%Y}.\n\n"
        f"Raporti është gjeneruar nga gjendja aktuale në PrimeFlow në orën {run.slot}.\n\n"
        "Përmbledhje:\n"
        f"- Persona të përfshirë: {run.included_user_count}\n"
        f"- Persona të përjashtuar për PV të plotë: {run.excluded_leave_count}\n"
        f"- Gabime gjithsej: {run.error_count}\n"
        f"- Gabime kritike: {run.critical_count}\n"
        f"- Gabime të larta: {run.high_count}\n\n"
        "Me respekt,\nPrimeFlow"
    )


async def send_report_run(
    db: AsyncSession,
    *,
    run_id: uuid.UUID,
    requested_by: uuid.UUID | None,
    resend: bool = False,
) -> WeeklyPlanningAuditDelivery:
    run = (await db.execute(
        select(WeeklyPlanningAuditRun)
        .where(WeeklyPlanningAuditRun.id == run_id)
        .with_for_update()
    )).scalar_one_or_none()
    if run is None:
        raise ValueError("Report run not found")
    if not run.storage_path or not run.filename or not run.file_checksum:
        raise ValueError("Report file is not available")
    path = Path(run.storage_path).resolve()
    root = _storage_root()
    if root not in path.parents or not path.is_file():
        raise ValueError("Stored report file is missing")

    if not resend:
        sent = (await db.execute(
            select(WeeklyPlanningAuditDelivery)
            .where(
                WeeklyPlanningAuditDelivery.report_run_id == run.id,
                WeeklyPlanningAuditDelivery.delivery_type == "INITIAL",
                WeeklyPlanningAuditDelivery.status == "SENT",
            )
            .order_by(WeeklyPlanningAuditDelivery.created_at.desc())
            .limit(1)
        )).scalar_one_or_none()
        if sent is not None:
            return sent
        recent_sending = (await db.execute(
            select(WeeklyPlanningAuditDelivery)
            .where(
                WeeklyPlanningAuditDelivery.report_run_id == run.id,
                WeeklyPlanningAuditDelivery.delivery_type == "INITIAL",
                WeeklyPlanningAuditDelivery.status == "SENDING",
                WeeklyPlanningAuditDelivery.created_at > datetime.now(ZoneInfo(settings.WEEKLY_PLANNING_AUDIT_TIMEZONE)) - timedelta(minutes=30),
            )
            .order_by(WeeklyPlanningAuditDelivery.created_at.desc())
            .limit(1)
        )).scalar_one_or_none()
        if recent_sending is not None:
            return recent_sending

    attempt = int((await db.execute(
        select(func.count(WeeklyPlanningAuditDelivery.id))
        .where(WeeklyPlanningAuditDelivery.report_run_id == run.id)
    )).scalar_one()) + 1
    delivery = build_delivery_record(
        run,
        requested_by=requested_by,
        resend=resend,
        attempt=attempt,
    )
    db.add(delivery)
    run.status = "SENDING"
    run.attempt_count = attempt
    await db.commit()
    await db.refresh(delivery)

    try:
        attachment = path.read_bytes()
        if hashlib.sha256(attachment).hexdigest() != run.file_checksum:
            raise ValueError("Stored report checksum does not match")
        sender_domain = os.environ.get("EMAIL_USER", "primeflow.local").rsplit("@", 1)[-1]
        stable_message_id = stable_smtp_message_id(
            run_id=run.id,
            delivery_id=delivery.id,
            resend=resend,
            sender_domain=sender_domain,
        )
        response = await GmailService().send_verified(
            run.subject or f"Raporti PF PLNF JAV {run.week_start:%d.%m.%Y}",
            run.recipients_snapshot,
            _email_body_from_run(run),
            attachments=[(
                run.filename,
                attachment,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )],
            message_id=stable_message_id,
        )
        delivery.status = "SENT"
        # SMTP confirms acceptance but does not return a Gmail provider ID.
        # Never present our RFC Message-ID as if Gmail assigned it.
        delivery.message_id = response.get("provider_message_id")
        delivery.smtp_response = str(response)[:2000]
        delivery.sent_at = datetime.now(ZoneInfo(settings.WEEKLY_PLANNING_AUDIT_TIMEZONE))
        run.status = "SENT"
        run.message_id = delivery.message_id
        run.error_message = None
        updated = update_weekly_planning_audit_delivery_metadata(
            path.read_bytes(),
            delivery_status="Sent",
            message_id=delivery.message_id,
            attempt_number=attempt,
        )
        _write_atomic(path, updated)
        run.file_checksum = hashlib.sha256(updated).hexdigest()
        await db.commit()
        logger.info(
            "weekly_planning_audit_sent run_id=%s delivery_id=%s resend=%s message_id=%s",
            run.id, delivery.id, resend, delivery.message_id,
        )
        return delivery
    except Exception as exc:
        record_delivery_failure(delivery, run, exc)
        try:
            updated = update_weekly_planning_audit_delivery_metadata(
                path.read_bytes(),
                delivery_status="Failed",
                message_id=None,
                attempt_number=attempt,
            )
            _write_atomic(path, updated)
            run.file_checksum = hashlib.sha256(updated).hexdigest()
        except Exception:
            logger.exception("weekly_planning_audit_failure_metadata_update_failed run_id=%s", run.id)
        await db.commit()
        logger.exception(
            "weekly_planning_audit_send_failed run_id=%s delivery_id=%s",
            run.id, delivery.id,
        )
        raise WeeklyPlanningAuditEmailError(str(exc)) from exc


async def generate_and_send_scheduled(slot: str, week_start: date | None = None) -> uuid.UUID | None:
    async with SessionLocal() as db:
        config = await get_or_create_settings(db)
        if not config.enabled:
            logger.info("weekly_planning_audit_skipped disabled=true slot=%s", slot)
            return None
        run = await generate_report_run(
            db,
            week_start=week_start,
            slot=slot,
            trigger_type=SCHEDULED,
            generated_by=None,
        )
        await db.commit()
        if run.status == "SENT":
            return run.id
        await send_report_run(db, run_id=run.id, requested_by=None, resend=False)
        return run.id


async def cleanup_expired_report_files() -> int:
    now = datetime.now(ZoneInfo(settings.WEEKLY_PLANNING_AUDIT_TIMEZONE))
    removed = 0
    root = _storage_root()
    async with SessionLocal() as db:
        config = await get_or_create_settings(db)
        cutoff = now - timedelta(days=config.retention_days)
        rows = (await db.execute(
            select(WeeklyPlanningAuditRun).where(
                WeeklyPlanningAuditRun.created_at < cutoff,
                WeeklyPlanningAuditRun.storage_path.is_not(None),
            )
        )).scalars().all()
        for run in rows:
            path = Path(run.storage_path or "").resolve()
            if root in path.parents and path.is_file():
                path.unlink()
                removed += 1
            run.storage_path = None
        await db.commit()
    logger.info("weekly_planning_audit_cleanup removed=%s", removed)
    return removed
