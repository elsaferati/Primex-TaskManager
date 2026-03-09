import unittest
from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.api.routers.system_tasks import _local_day_utc_bounds, _template_zoneinfo


class TestSystemTasksListTimezoneBounds(unittest.TestCase):
    def test_invalid_timezone_falls_back_to_app_timezone(self) -> None:
        template = SimpleNamespace(timezone="Invalid/Zone")
        tzinfo, tz_name = _template_zoneinfo(template)
        self.assertEqual(tz_name, "Europe/Budapest")
        start_utc, end_utc = _local_day_utc_bounds(date(2026, 2, 24), tzinfo)
        self.assertEqual(start_utc, datetime(2026, 2, 23, 23, 0, tzinfo=timezone.utc))
        self.assertEqual(end_utc, datetime(2026, 2, 24, 23, 0, tzinfo=timezone.utc))

    def test_different_timezones_produce_different_utc_windows(self) -> None:
        tirana_tmpl = SimpleNamespace(timezone="Europe/Tirane")
        tokyo_tmpl = SimpleNamespace(timezone="Asia/Tokyo")
        tirana_tz, _ = _template_zoneinfo(tirana_tmpl)
        tokyo_tz, _ = _template_zoneinfo(tokyo_tmpl)
        tirana_start, tirana_end = _local_day_utc_bounds(date(2026, 2, 24), tirana_tz)
        tokyo_start, tokyo_end = _local_day_utc_bounds(date(2026, 2, 24), tokyo_tz)
        self.assertNotEqual(tirana_start, tokyo_start)
        self.assertNotEqual(tirana_end, tokyo_end)


if __name__ == "__main__":
    unittest.main()

