"""Read-only integration check. Does not save reports or send email."""
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import text
from app.db import SessionLocal, engine
from app.services.m3_reporting_points import build_task_data, build_realization_capture, render_html, render_plain_text
from app.services.primeflow_report import report_timezone


async def main():
    day = datetime.now(report_timezone()).date()
    async with SessionLocal() as db:
        await db.execute(text("SET TRANSACTION READ ONLY"))
        data = await build_task_data(db, day)
        realization = await build_realization_capture(db, day)
        report = {"report_date": day.isoformat(), "data": data, "manual_answers": {},
                  "realization": realization, "realization_captured_at": None}
        html_body = render_html(report)
        plain_text = render_plain_text(report)
        assert all(row["status"] == "TODO" for row in data["untouched"])
        assert all(row["created_date"] == row["start_date"] == row["due_date"] == day.isoformat() for row in data["same_day"])
        assert len({row["task_id"] for row in data["ga_postponed"]}) == len(data["ga_postponed"])
        print(json.dumps({"day": day.isoformat(), "counts": {key: len(rows) for key, rows in data.items()},
                          "employees": realization["employees"], "live_realization_percent_for_test_only": realization["percent"],
                          "baseline_available": realization["baseline_available"], "html_characters": len(html_body),
                          "plain_text_characters": len(plain_text), "writes": 0, "emails_sent": 0}))
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
