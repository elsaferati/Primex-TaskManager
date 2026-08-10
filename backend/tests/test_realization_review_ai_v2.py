from __future__ import annotations

import unittest
import inspect
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from app.models.enums import RealizationLevel, RealizationMarker, RealizationObservationCategory, RealizationScopeType
from app.models.realization import RealizationPersonResult, RealizationQuestionAnswer
from app.api.routers.realization import _mark_ai_stale_for_subject, _weekly_response
from app.schemas.realization import RealizationFinalDecision, RealizationObservationCreate
from app.services.realization_ai import (
    _safe_input,
    analyze_realization,
    mark_analysis_stale,
    record_analysis_state,
)
from app.services.realization_calculator import (
    MANDATORY_MANUAL_QUESTION_KEYS,
    build_questions,
    missing_manual_question_keys,
)
from app.services.realization_narrative import build_albanian_narrative
from app.services.realization_evidence import (
    qualifies_as_verified_extra,
    verified_positive_counter_updates,
)
from app.services.realization_policy import evaluate_policy


CRITERIA = {
    "algorithm": "first_matching_rule",
    "frequent_tardiness_threshold": 3,
    "a_plus_verified_extra_min": 2,
    "a_verified_extra_min": 1,
    "unexpected_absence_e_threshold": 2,
    "repeated_problem_d_threshold": 2,
}


class TestCompleteAIInput(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.facts = {
            "counters": {"planned_count": 8, "accounted_planned_count": 3, "verified_extra_count": 4},
            "tasks": [{
                "task_id": "task-amazon",
                "title": "Amazon MWS Feed",
                "project_title": "Amazon Integration",
                "source_type": "project",
                "classification": "no_progress",
                "status": "TODO",
                "planned_occurrences": [{"day": "2026-08-03"}],
                "planned_deadline": "2026-08-03T16:00:00Z",
                "effective_deadline": "2026-08-04T16:00:00Z",
                "user_comment": "Blocked because supplier XML was missing until Thursday 14:00.",
                "rlz_impact": "PINK_ACTION_REQUIRED",
                "attribution": "planned_owner",
            }],
            "observations": [
                {
                    "id": "evidence-help",
                    "marker": "POSITIVE",
                    "category": "HELPED_COLLEAGUE",
                    "comment": "Ndihmoi EF për upload-in dhe kurseu rreth 2 orë.",
                    "verified": True,
                    "task_id": "task-amazon",
                    "user_id": "employee-id",
                    "impact_minutes": 120,
                    "repeat_count": 1,
                    "source_type": "manager_manual",
                    "created_at": "2026-08-06T12:00:00Z",
                    "evidence_json": {"helped_user_id": "ef-id"},
                },
                {
                    "id": "evidence-proposal",
                    "marker": "POSITIVE",
                    "category": "PROPOSAL",
                    "comment": "Propozoi kontroll automatik për feed-et e furnitorëve.",
                    "verified": True,
                    "source_type": "manager_manual",
                },
                {
                    "id": "evidence-extra",
                    "marker": "POSITIVE",
                    "category": "EXTRA_TASK",
                    "comment": "Përfundoi një detyrë shtesë pasi kërkoi punë të re.",
                    "verified": True,
                    "source_type": "manager_manual",
                },
                {
                    "id": "evidence-quality",
                    "marker": "POSITIVE",
                    "category": "QUALITY",
                    "comment": "Dorëzimi shtesë kaloi kontrollin pa korrigjime.",
                    "verified": True,
                    "source_type": "manager_manual",
                },
            ],
            "manual_answers": {
                "requested_extra_tasks": {
                    "value": True,
                    "comment": "Kërkoi punë shtesë të enjten.",
                    "answered_by_name": "Manager",
                    "answered_at": "2026-08-07T16:00:00Z",
                    "evidence_ids": ["evidence-extra"],
                },
                "helped_colleague": {
                    "value": True,
                    "comment": "Po, ndihma ishte domethënëse.",
                    "answered_by_name": "Manager",
                    "answered_at": "2026-08-07T16:00:00Z",
                    "evidence_ids": ["evidence-help"],
                },
                "extra_engagement": {
                    "value": True,
                    "comment": "Angazhim i verifikuar jashtë planit.",
                    "answered_by_name": "Manager",
                    "answered_at": "2026-08-07T16:00:00Z",
                    "evidence_ids": ["evidence-quality"],
                },
                "gave_proposal": {
                    "value": True,
                    "comment": "Propozimi u demonstrua dhe u pranua.",
                    "answered_by_name": "Manager",
                    "answered_at": "2026-08-07T16:00:00Z",
                    "evidence_ids": ["evidence-proposal"],
                },
            },
            "daily_timeline": [{
                "date": "2026-08-07",
                "planned_count": 2,
                "completed_count": 1,
                "close_state": "CLOSED",
                "close_event": {"daily_comment": "XML mbërriti; puna vazhdon të hënën.", "confirmed_pulse": "?"},
            }],
            "decision": {"hard_cap_level": "D", "reasons": ["5 obligations unresolved"]},
            "manager_review_comment": "Rishikimi paraprak i menaxherit.",
        }

    def test_safe_input_keeps_task_title_and_employee_comment(self) -> None:
        payload = _safe_input("result", self.facts)
        self.assertEqual(payload["tasks"][0]["title"], "Amazon MWS Feed")
        self.assertIn("supplier XML", payload["tasks"][0]["employee_comment"])
        self.assertTrue(payload["tasks"][0]["pink_no_progress"])

    def test_safe_input_keeps_complete_observation_comment(self) -> None:
        observation = _safe_input("result", self.facts)["observations"][0]
        self.assertIn("kurseu rreth 2 orë", observation["comment"])
        self.assertEqual(observation["impact_minutes"], 120)
        self.assertEqual(observation["source_type"], "manager_manual")

    def test_safe_input_keeps_manual_answer_and_daily_close_comment(self) -> None:
        payload = _safe_input("result", self.facts)
        self.assertTrue(payload["manual_answers"]["helped_colleague"]["value"])
        self.assertIn("domethënëse", payload["manual_answers"]["helped_colleague"]["comment"])
        self.assertIn("XML mbërriti", payload["daily_timeline"][0]["employee_daily_close_comment"])
        self.assertIn("paraprak", payload["manager_review_comment"])

    async def test_fallback_acknowledges_positive_context_but_keeps_d(self) -> None:
        with patch("app.services.realization_ai.settings.REALIZATION_AI_ENABLED", False):
            analysis = await analyze_realization("result", self.facts, suggested_level="D")
        self.assertEqual(analysis["suggested_level"], "D")
        positives = " ".join(analysis["positives"])
        self.assertIn("Ndihmoi EF", positives)
        self.assertIn("Propozoi kontroll automatik", positives)
        self.assertIn("Përfundoi një detyrë shtesë", positives)
        self.assertIn("kaloi kontrollin pa korrigjime", positives)
        self.assertIn("5/8", analysis["grade_reason"])
        self.assertIn("helped_colleague", analysis["question_keys_used"])
        self.assertIn("gave_proposal", analysis["question_keys_used"])
        self.assertTrue({
            "evidence-help", "evidence-proposal", "evidence-extra", "evidence-quality",
        }.issubset(set(analysis["evidence_ids"])))
        self.assertTrue(analysis["advisory_only"])


class TestManualQuestionPhilosophy(unittest.TestCase):
    def _questions(self) -> dict[str, dict]:
        person = {"counters": {"planned_count": 1, "completed_on_time_count": 1}, "tasks": [], "observations": []}
        decision = evaluate_policy(person["counters"], CRITERIA)
        return {row["key"]: row for row in build_questions(person, decision, build_albanian_narrative(person))}

    def test_sections_two_and_three_are_manual(self) -> None:
        questions = self._questions()
        for key in {
            "requested_extra_tasks", "helped_colleague", "extra_engagement", "gave_proposal",
            "respected_meetings", "closed_tasks", "frequent_delays", "unexpected_absences",
        }:
            self.assertEqual(questions[key]["source_status"], "MANUAL_UNANSWERED", key)
            self.assertIn("auto_value", questions[key])

    def test_missing_mandatory_answers_blocks_completeness(self) -> None:
        missing = missing_manual_question_keys({"requested_extra_tasks", "helped_colleague"})
        self.assertEqual(len(missing), len(MANDATORY_MANUAL_QUESTION_KEYS) - 2)
        self.assertIn("respected_meetings", missing)

    def test_append_only_answer_model_has_audit_chain(self) -> None:
        columns = RealizationQuestionAnswer.__table__.columns
        self.assertIn("supersedes_answer_id", columns)
        self.assertIn("answered_by", columns)
        self.assertIn("answered_at", columns)
        self.assertIn("value_json", columns)


class TestEvidenceAndPolicyIntegration(unittest.TestCase):
    def test_recurring_verified_positive_categories_increment_extras(self) -> None:
        for category in ("PROPOSAL", "HELPED_COLLEAGUE", "TIME_SAVED", "QUALITY"):
            self.assertTrue(
                qualifies_as_verified_extra(
                    marker="POSITIVE", category=category, evidence_json={}
                ),
                category,
            )

    def test_proposal_help_and_time_saved_update_specific_counters(self) -> None:
        proposal = verified_positive_counter_updates(marker="POSITIVE", category="PROPOSAL", impact_minutes=None, evidence_json={})
        helped = verified_positive_counter_updates(marker="POSITIVE", category="HELPED_COLLEAGUE", impact_minutes=None, evidence_json={})
        saved = verified_positive_counter_updates(marker="POSITIVE", category="TIME_SAVED", impact_minutes=120, evidence_json={})
        self.assertEqual(proposal, {"proposal_count": 1, "verified_extra_count": 1})
        self.assertEqual(helped, {"helped_colleague_count": 1, "verified_extra_count": 1})
        self.assertEqual(saved, {"time_saved_minutes": 120, "verified_extra_count": 1})

    def test_positive_evidence_counters_can_produce_a_plus_only_when_accounted(self) -> None:
        accounted = evaluate_policy(
            {"planned_count": 8, "accounted_planned_count": 8, "completed_on_time_count": 8, "verified_extra_count": 4},
            CRITERIA,
        )
        unresolved = evaluate_policy(
            {"planned_count": 8, "accounted_planned_count": 3, "completed_on_time_count": 3, "verified_extra_count": 4},
            CRITERIA,
        )
        self.assertEqual(accounted.level, RealizationLevel.A_PLUS)
        self.assertEqual(unresolved.level, RealizationLevel.D)

    def test_verified_repeated_problem_and_missed_meeting_affect_policy(self) -> None:
        repeated = evaluate_policy({"planned_count": 1, "completed_on_time_count": 1, "repeated_problem_count": 2}, CRITERIA)
        meeting = evaluate_policy({"planned_count": 1, "completed_on_time_count": 1, "meeting_missed_count": 1}, CRITERIA)
        self.assertEqual(repeated.level, RealizationLevel.D)
        self.assertEqual(meeting.level, RealizationLevel.D)

    def test_time_saved_requires_minutes_and_comment(self) -> None:
        with self.assertRaises(ValueError):
            RealizationObservationCreate(
                scope_type=RealizationScopeType.PERSON,
                user_id="00000000-0000-0000-0000-000000000001",
                marker=RealizationMarker.POSITIVE,
                category=RealizationObservationCategory.TIME_SAVED,
                comment="Saved time",
                impact_minutes=0,
            )

    def test_blocker_requires_colleague_and_impact(self) -> None:
        with self.assertRaises(ValueError):
            RealizationObservationCreate(
                scope_type=RealizationScopeType.PERSON,
                user_id="00000000-0000-0000-0000-000000000001",
                marker=RealizationMarker.NEGATIVE,
                category=RealizationObservationCategory.BLOCKER,
                comment="Blocked colleague",
                evidence_json={},
            )

    def test_missed_meeting_requires_valid_reference_fields(self) -> None:
        with self.assertRaises(ValueError):
            RealizationObservationCreate(
                scope_type=RealizationScopeType.PERSON,
                user_id="00000000-0000-0000-0000-000000000001",
                marker=RealizationMarker.NEGATIVE,
                category=RealizationObservationCategory.MISSED_MEETING,
                comment="Missed",
                evidence_json={"occurrence_date": "2026-08-05"},
            )

    def test_manager_override_still_requires_reason(self) -> None:
        decision = RealizationFinalDecision(final_level="A", final_symbol="+", override_reason=None)
        with self.assertRaises(ValueError):
            decision.validate_against_suggestion(suggested_level=RealizationLevel.D, suggested_symbol="-")

    def test_ai_proposal_is_stored_separately(self) -> None:
        columns = RealizationPersonResult.__table__.columns
        self.assertIn("suggested_level", columns)
        self.assertIn("ai_suggested_level", columns)
        self.assertIn("ai_analysis_stale", columns)

    def test_ai_becomes_stale_and_regeneration_clears_it(self) -> None:
        result = type("Result", (), {
            "ai_generated_at": datetime.now(timezone.utc),
            "ai_analysis_stale": False,
            "ai_suggested_level": "B",
        })()
        mark_analysis_stale(result)
        self.assertTrue(result.ai_analysis_stale)
        record_analysis_state(result, {"suggested_level": "A"}, datetime.now(timezone.utc))
        self.assertFalse(result.ai_analysis_stale)
        self.assertEqual(result.ai_suggested_level, "A")


class TestFrontendEvidenceContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = (Path(__file__).parents[2] / "frontend/src/app/(app)/realization/page.tsx").read_text(encoding="utf-8")

    def test_all_backend_categories_are_exposed_or_mapped(self) -> None:
        for category in RealizationObservationCategory:
            self.assertIn(category.value, self.source)

    def test_time_saved_and_meeting_reference_are_sent(self) -> None:
        self.assertIn('impact_minutes: evidenceCategory === "TIME_SAVED"', self.source)
        self.assertIn("evidenceJson.meeting_id = meetingId", self.source)
        self.assertNotIn("nuk kërkohet ID", self.source)


class TestWeeklyResponseRegression(unittest.TestCase):
    def test_weekly_response_builds_and_returns_the_response(self) -> None:
        source = inspect.getsource(_weekly_response)
        self.assertIn("return RealizationWeeklyOut(", source)
        self.assertNotIn("async def _mark_ai_stale_for_subject", source)

    def test_ai_stale_helper_does_not_capture_weekly_response_body(self) -> None:
        source = inspect.getsource(_mark_ai_stale_for_subject)
        self.assertNotIn("close_history", source)
        self.assertNotIn("return RealizationWeeklyOut(", source)


if __name__ == "__main__":
    unittest.main()
