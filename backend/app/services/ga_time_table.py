from dataclasses import dataclass
from datetime import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ga_time_table_row import GaTimeTableRow


@dataclass(frozen=True)
class GaTimeTableRowData:
    sort_order: int
    nr_label: str
    label: str
    start_time: time
    end_time: time
    is_special: bool = False


def _time(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


DEFAULT_GA_TIME_TABLE_ROWS: tuple[GaTimeTableRowData, ...] = (
    GaTimeTableRowData(0, "", "", _time("00:00"), _time("00:01"), True),
    GaTimeTableRowData(1, "", "", _time("00:01"), _time("00:02"), True),
    GaTimeTableRowData(2, "1", "07:30 - 08:00", _time("07:30"), _time("08:00")),
    GaTimeTableRowData(3, "2", "08:00 - 09:00", _time("08:00"), _time("09:00")),
    GaTimeTableRowData(4, "3", "09:00 - 10:00", _time("09:00"), _time("10:00")),
    GaTimeTableRowData(5, "4", "10:00 - 11:00", _time("10:00"), _time("11:00")),
    GaTimeTableRowData(6, "5", "11:00 - 12:00", _time("11:00"), _time("12:00")),
    GaTimeTableRowData(7, "6", "12:00 - 13:00", _time("12:00"), _time("13:00")),
    GaTimeTableRowData(8, "7", "13:00 - 13:30", _time("13:00"), _time("13:30")),
    GaTimeTableRowData(9, "8", "13:30 - 14:00", _time("13:30"), _time("14:00")),
    GaTimeTableRowData(10, "9", "14:00 - 14:30", _time("14:00"), _time("14:30")),
    GaTimeTableRowData(11, "10", "14:30 - 15:30", _time("14:30"), _time("15:30")),
    GaTimeTableRowData(12, "11", "15:30 - 16:00", _time("15:30"), _time("16:00")),
    GaTimeTableRowData(13, "12", "16:00 - 16:30", _time("16:00"), _time("16:30")),
    GaTimeTableRowData(14, "13", "16:30 - 17:00", _time("16:30"), _time("17:00")),
    GaTimeTableRowData(15, "14", "17:00 - 18:00", _time("17:00"), _time("18:00")),
    GaTimeTableRowData(16, "15", "18:00 - 19:00", _time("18:00"), _time("19:00")),
    GaTimeTableRowData(17, "16", "19:00 - 20:00", _time("19:00"), _time("20:00")),
    GaTimeTableRowData(18, "17", "20:00 - 21:00", _time("20:00"), _time("21:00")),
    GaTimeTableRowData(19, "18", "21:00 - 22:00", _time("21:00"), _time("22:00")),
)


def format_ga_time_label(start_time: time, end_time: time) -> str:
    return f"{start_time.hour:02d}:{start_time.minute:02d} - {end_time.hour:02d}:{end_time.minute:02d}"


async def get_ga_time_table_rows(db: AsyncSession) -> list[GaTimeTableRow | GaTimeTableRowData]:
    rows = (
        await db.execute(select(GaTimeTableRow).order_by(GaTimeTableRow.sort_order, GaTimeTableRow.start_time))
    ).scalars().all()
    return list(rows) if rows else list(DEFAULT_GA_TIME_TABLE_ROWS)
