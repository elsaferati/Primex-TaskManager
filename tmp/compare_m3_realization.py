"""Read-only comparison of M3's saved/live value and the Realization total formula."""
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select, text
from app.db import SessionLocal, engine
from app.models.m3_reporting_points import M3ReportingPointsReport
from app.services.m3_reporting_points import build_realization_capture
from app.services.daily_realization_metrics import realization_percent
from app.services.primeflow_report import report_timezone


def combined_metrics(realization):
    fields = ("realization_credit", "realization_plan_weight", "realization_penalty_points",
              "original_planned_count", "additional_count", "total_completed_today_count")
    totals = {key: sum((item.get("metrics") or {}).get(key, 0) or 0
                       for item in realization.get("departments", [])) for key in fields}
    totals["raw_plan_realization"] = realization_percent(
        totals["realization_credit"], totals["realization_plan_weight"], totals["additional_count"],
        totals["realization_penalty_points"], totals["original_planned_count"] or totals["additional_count"],
    )
    return totals


async def main():
    day = datetime.now(report_timezone()).date()
    try:
        async with SessionLocal() as db:
            await db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"))
            saved = (await db.execute(select(M3ReportingPointsReport).where(
                M3ReportingPointsReport.report_date == day))).scalar_one_or_none()
            live = await build_realization_capture(db, day)
            print(json.dumps({
                "day": day.isoformat(),
                "saved_m3_percent": (saved.realization or {}).get("percent") if saved else None,
                "saved_generated_at": saved.generated_at.isoformat() if saved and saved.generated_at else None,
                "fresh_m3_percent": live["percent"],
                "fresh_m3_metrics": {key: live["metrics"].get(key) for key in combined_metrics(live)},
                "realization_total_same_data": combined_metrics(live),
                "writes": 0, "emails_sent": 0,
            }))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
