from __future__ import annotations

import asyncio
import logging
import signal
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.services.primeflow_report import SCHEDULES, report_timezone
from app.services.primeflow_report_delivery import execute_chain, validate_report_config

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("primeflow-report-scheduler")


async def scheduled_job(slot: str) -> None:
    now = datetime.now(report_timezone())
    await execute_chain(now.date(), slot)


async def main() -> None:
    validate_report_config()
    timezone = report_timezone()
    scheduler = AsyncIOScheduler(timezone=timezone)
    for slot, execution in SCHEDULES.items():
        hour, minute = map(int, execution.split(":"))
        scheduler.add_job(
            scheduled_job, CronTrigger(day_of_week="mon-fri", hour=hour, minute=minute, timezone=timezone),
            args=[slot], id=f"primeflow_1h_{slot.replace(':', '')}", max_instances=1,
            coalesce=True, misfire_grace_time=1800, replace_existing=True,
        )
    scheduler.start()
    logger.info("scheduler_ready jobs=%s timezone=%s", len(scheduler.get_jobs()), timezone)
    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stopped.set)
        except NotImplementedError:
            pass
    await stopped.wait()
    scheduler.shutdown(wait=True)


if __name__ == "__main__":
    asyncio.run(main())
