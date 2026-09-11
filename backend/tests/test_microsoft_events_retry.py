from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import httpx

from app.api.routers.microsoft import fetch_calendar_events_with_retry


class TestMicrosoftEventsRetry(unittest.IsolatedAsyncioTestCase):
    async def test_retries_one_transient_connection_failure(self) -> None:
        start = datetime.now(timezone.utc)
        end = start + timedelta(days=1)
        request = httpx.Request("GET", "https://graph.microsoft.com/v1.0/me/calendarView")
        transient_error = httpx.ReadTimeout("timed out", request=request)

        with patch(
            "app.api.routers.microsoft.fetch_calendar_events",
            new=AsyncMock(side_effect=[transient_error, [{"id": "event-1"}]]),
        ) as fetch:
            result = await fetch_calendar_events_with_retry("token", start, end)

        self.assertEqual(result, [{"id": "event-1"}])
        self.assertEqual(fetch.await_count, 2)

    async def test_raises_after_second_connection_failure(self) -> None:
        start = datetime.now(timezone.utc)
        end = start + timedelta(days=1)
        request = httpx.Request("GET", "https://graph.microsoft.com/v1.0/me/calendarView")

        with patch(
            "app.api.routers.microsoft.fetch_calendar_events",
            new=AsyncMock(
                side_effect=[
                    httpx.ReadTimeout("first timeout", request=request),
                    httpx.ReadTimeout("second timeout", request=request),
                ]
            ),
        ):
            with self.assertRaises(httpx.ReadTimeout):
                await fetch_calendar_events_with_retry("token", start, end)


if __name__ == "__main__":
    unittest.main()
