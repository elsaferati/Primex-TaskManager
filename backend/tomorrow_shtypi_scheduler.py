from __future__ import annotations

import asyncio
import logging

from app.services.tomorrow_print_report_scheduler import (
    run_tomorrow_print_report_scheduler_forever,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


if __name__ == "__main__":
    asyncio.run(run_tomorrow_print_report_scheduler_forever())
