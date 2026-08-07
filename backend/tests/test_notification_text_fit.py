from __future__ import annotations

import unittest

from app.services.notifications import (
    NOTIFICATION_BODY_MAX_LEN,
    NOTIFICATION_TITLE_MAX_LEN,
    fit_notification_text,
    notification_task_preview,
)


class NotificationTextFitTests(unittest.TestCase):
    def test_fit_notification_text_keeps_short_values(self) -> None:
        self.assertEqual(fit_notification_text("Hello", 10), "Hello")
        self.assertIsNone(fit_notification_text(None, 10))

    def test_fit_notification_text_truncates_to_column_limits(self) -> None:
        long_title = "T" * (NOTIFICATION_TITLE_MAX_LEN + 50)
        long_body = "B" * (NOTIFICATION_BODY_MAX_LEN + 200)
        fitted_title = fit_notification_text(long_title, NOTIFICATION_TITLE_MAX_LEN)
        fitted_body = fit_notification_text(long_body, NOTIFICATION_BODY_MAX_LEN)
        assert fitted_title is not None
        assert fitted_body is not None
        self.assertEqual(len(fitted_title), NOTIFICATION_TITLE_MAX_LEN)
        self.assertEqual(len(fitted_body), NOTIFICATION_BODY_MAX_LEN)
        self.assertTrue(fitted_title.endswith("…"))
        self.assertTrue(fitted_body.endswith("…"))

    def test_notification_task_preview_uses_first_line(self) -> None:
        preview = notification_task_preview("First bullet\nSecond bullet\nThird", limit=280)
        self.assertEqual(preview, "First bullet")

    def test_long_ga_note_title_can_be_used_for_assignment_notification(self) -> None:
        # Reproduces the PX Notes failure: assignment notifications used the full
        # task title, which exceeds notifications.body String(4000).
        long_title = "\n".join(f"- item {index} " + ("x" * 80) for index in range(80))
        self.assertGreater(len(long_title), NOTIFICATION_BODY_MAX_LEN)
        body = fit_notification_text(long_title, NOTIFICATION_BODY_MAX_LEN)
        assert body is not None
        self.assertLessEqual(len(body), NOTIFICATION_BODY_MAX_LEN)


if __name__ == "__main__":
    unittest.main()
