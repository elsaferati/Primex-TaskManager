import unittest
from unittest.mock import patch

from app.services.realization_ai import analyze_realization


class TestRealizationAI(unittest.IsolatedAsyncioTestCase):
    async def test_evidence_engine_fallback_works_without_external_ai(self) -> None:
        facts = {
            "weekly_planned_count": 6,
            "weekly_completed_count": 4,
            "weekly_additional_count": 2,
            "weekly_progress_percent": 66.7,
            "daily_timeline": [
                {"date": "2026-08-03", "has_snapshot": True},
                {"date": "2026-08-04", "has_snapshot": True},
            ],
            "tasks": [
                {"task_id": "task-1", "classification": "completed"},
                {"task_id": "task-2", "classification": "no_progress"},
            ],
            "observations": [
                {"id": "evidence-1", "marker": "POSITIVE", "verified": True}
            ],
            "questions": [
                {
                    "key": "helped_colleague",
                    "label": "Ndihmoi koleg?",
                    "source_status": "AUTO_NEEDS_CONFIRMATION",
                }
            ],
        }

        with patch("app.services.realization_ai.settings.REALIZATION_AI_ENABLED", False):
            analysis = await analyze_realization(
                "result-1", facts, suggested_level="C"
            )

        self.assertEqual(analysis["model"], "primeflow-evidence-engine-v2")
        self.assertEqual(analysis["suggested_level"], "C")
        self.assertIn("4/6", analysis["summary"])
        self.assertIn("Ndihmoi koleg?", analysis["missing_evidence"])
        self.assertIn("task-1", analysis["evidence_ids"])
        self.assertTrue(analysis["advisory_only"])


if __name__ == "__main__":
    unittest.main()
