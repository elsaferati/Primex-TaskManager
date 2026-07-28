from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from datetime import date, datetime, timedelta

from sqlalchemy import select, text
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

from app.db import SessionLocal
from app.models.primeflow_report_delivery_run import PrimeFlowReportDeliveryRun
from app.services.primeflow_report import (
    GmailService, GmailVerificationError, PrimeFlowClient, build_report, predecessor, report_subject, report_timezone,
)

logger = logging.getLogger(__name__)
TERMINAL = {"SENT", "ALREADY_SENT"}


def _recipients() -> list[str]:
    raw = os.getenv("PRIMEFLOW_REPORT_RECIPIENTS", "130primex.eu@gmail.com,ga@primexeu.com")
    return [value.strip() for value in raw.split(",") if value.strip()]


def validate_report_config(*, require_gmail: bool = True) -> None:
    required = ["DATABASE_URL", "PRIMEFLOW_API_BASE_URL", "PRIMEFLOW_REPORT_TIMEZONE"]
    if not os.getenv("PRIMEFLOW_ACCESS_TOKEN"):
        required.extend(["PRIMEFLOW_EMAIL", "PRIMEFLOW_PASSWORD"])
    if require_gmail:
        required.extend([
            "PRIMEFLOW_REPORT_GMAIL_CLIENT_ID", "PRIMEFLOW_REPORT_GMAIL_CLIENT_SECRET",
            "PRIMEFLOW_REPORT_GMAIL_REFRESH_TOKEN", "PRIMEFLOW_REPORT_GMAIL_SENDER",
        ])
    missing = sorted({name for name in required if not os.getenv(name)})
    if missing:
        raise RuntimeError("Missing required report configuration: " + ", ".join(missing))
    report_timezone()


async def generate_fresh(day: date, slot: str) -> tuple[str, datetime]:
    client = PrimeFlowClient(
        os.environ["PRIMEFLOW_API_BASE_URL"].rstrip("/"),
        os.getenv("PRIMEFLOW_EMAIL"), os.getenv("PRIMEFLOW_PASSWORD"), os.getenv("PRIMEFLOW_ACCESS_TOKEN"),
    )
    data = await client.common_view(day)
    generated = datetime.fromisoformat(data["generated_at"].replace("Z", "+00:00"))
    return build_report(data, day, slot), generated


async def deliver_report(day: date, slot: str, *, send: bool = True, scheduled_for: datetime | None = None) -> PrimeFlowReportDeliveryRun:
    subject, recipients = report_subject(day, slot), _recipients()
    now = datetime.now(report_timezone())
    async with SessionLocal() as db:
        async with db.begin():
            # Serialize even the first insert; the unique constraint remains the
            # final guard if another application bypasses this service.
            lock_key = f"primeflow_1h|{day.isoformat()}|{slot}|default"
            await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": lock_key})
            run = (await db.execute(
                select(PrimeFlowReportDeliveryRun)
                .where(
                    PrimeFlowReportDeliveryRun.report_type == "primeflow_1h",
                    PrimeFlowReportDeliveryRun.report_date == day,
                    PrimeFlowReportDeliveryRun.report_slot == slot,
                    PrimeFlowReportDeliveryRun.recipient_group == "default",
                ).with_for_update()
            )).scalar_one_or_none()
            if run is None:
                run = PrimeFlowReportDeliveryRun(
                    report_date=day, report_slot=slot, recipient_group="default",
                    subject=subject, recipients=json.dumps(recipients), status="PENDING",
                    scheduled_for=scheduled_for,
                )
                db.add(run)
                await db.flush()
            if run.status in TERMINAL:
                return run
            if run.status == "RUNNING" and run.started_at and run.started_at > now - timedelta(minutes=30):
                return run
            run.status, run.started_at, run.attempt_count = "RUNNING", now, run.attempt_count + 1

        gmail = GmailService() if send else None
        try:
            if gmail:
                existing = await gmail.find_exact(subject, recipients)
                if existing:
                    run.status = "ALREADY_SENT"
                    run.gmail_message_id, run.gmail_thread_id = existing.get("id"), existing.get("threadId")
                    run.finished_at = datetime.now(report_timezone())
                    await db.commit()
                    return run
            body, generated_at = await generate_fresh(day, slot)
            run.body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
            run.data_generated_at = generated_at
            if not send:
                run.status, run.finished_at = "PENDING", datetime.now(report_timezone())
                await db.commit()
                setattr(run, "dry_run_body", body)
                return run
            message = await gmail.send_verified(subject, recipients, body)
            run.status = "SENT"
            run.gmail_message_id, run.gmail_thread_id = message.get("id"), message.get("threadId")
        except ValueError as exc:
            run.status, run.error_code, run.error_message = "FAILED_DATA", type(exc).__name__, str(exc)[:2000]
        except GmailVerificationError as exc:
            run.status, run.error_code, run.error_message = "FAILED_VERIFICATION", type(exc).__name__, str(exc)[:2000]
            run.gmail_message_id = exc.response.get("id")
            run.gmail_thread_id = exc.response.get("threadId")
        except Exception as exc:
            run.status, run.error_code, run.error_message = "FAILED_EMAIL", type(exc).__name__, str(exc)[:2000]
        run.finished_at = datetime.now(report_timezone())
        await db.commit()
        logger.info("primeflow_report_run run_id=%s report_date=%s report_slot=%s final_status=%s", run.id, day, slot, run.status)
        return run


async def execute_chain(day: date, slot: str) -> list[PrimeFlowReportDeliveryRun]:
    if day.weekday() >= 5:
        return []
    preceding_day, preceding_slot = predecessor(day, slot)
    first = await deliver_report(preceding_day, preceding_slot)
    second = await deliver_report(day, slot)
    return [first, second]
