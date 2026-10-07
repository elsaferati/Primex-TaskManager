"""Read-only comparison of M2 reporting points with the after-break priority table."""
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import text
from app.db import SessionLocal, engine
from app.services.after_break_report import build_unfinished_priority_task_rows
from app.services.m2_reporting_points import build_task_data, render_html, render_plain_text
from app.services.primeflow_report import report_timezone


async def main():
    day = datetime.now(report_timezone()).date()
    try:
        async with SessionLocal() as db:
            await db.execute(text("SET TRANSACTION READ ONLY"))
            data = await build_task_data(db, day)
            reference = await build_unfinished_priority_task_rows(db, day)
            fields = ("assignees", "department", "am_pm", "status", "priority", "task_type", "title", "due_label")
            assert [[row[key] for key in fields] for row in data["unfinished_priority"]] == [row[1:] for row in reference]
            report = {"report_date": day.isoformat(), "manual_answers": {}, "data": data}
            html = render_html(report)
            plain = render_plain_text(report)
            assert html.index("2. DET TE PAKRYERA") < html.index("3. A KA DET") < html.index("4. A JANE")
            assert "DUE DATE" in plain or not reference
            print(json.dumps({"day": day.isoformat(), "counts": {key: len(rows) for key, rows in data.items()},
                              "matches_after_break": True, "writes": 0, "emails_sent": 0}))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
