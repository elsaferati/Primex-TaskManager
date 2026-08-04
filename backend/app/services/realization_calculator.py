from __future__ import annotations

import uuid
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import RealizationPeriodStatus
from app.models.realization import (
    RealizationDepartmentResult,
    RealizationPeriod,
    RealizationPersonResult,
    RealizationPolicyVersion,
)
from app.services.realization_evidence import collect_weekly_evidence
from app.services.realization_narrative import build_albanian_narrative
from app.services.realization_periods import require_recalculable, transition_period
from app.services.realization_policy import evaluate_policy


QUESTION_LABELS = {
    "task_status": "Statusi i detyrave",
    "new_tasks_added": "Detyra të reja shtuar?",
    "approved_postponement": "Shtyrje me konfirmim?",
    "requested_extra_tasks": "Kërkoi detyra shtesë?",
    "helped_colleague": "Ndihmoi koleg?",
    "extra_engagement": "Angazhim ekstra?",
    "gave_proposal": "Dha propozim?",
    "respected_meetings": "Respektoi takimet?",
    "closed_tasks": "Mbylli detyrat?",
    "frequent_delays": "Vonesa të shpeshta?",
    "unexpected_absences": "Mungesa të papritura?",
    "week_positive": "Çka ka sjellë pozitive personi në këtë javë?",
    "week_problems": "Çka ka pasur probleme (ka prishur diçka)?",
    "affected_other_plan": "A ja ka prishur dikujt tjetër planin?",
    "repeated_after_clarification": "A ka pasur përsëritje të detyrave edhe pas sqarimeve?",
    "current_level": "Niveli",
    "suggested_evaluation_level": "Propozimi për nivelin e vlerësimit",
    "evaluation": "Vlerësimi",
    "comments": "Komente",
}


def _question(
    key: str,
    auto_value: Any,
    *,
    source_status: str = "AUTO",
    evidence_ids: list[str] | None = None,
    explanation: str = "",
    answer_type: str = "value",
) -> dict[str, Any]:
    return {
        "key": key,
        "label": QUESTION_LABELS[key],
        "answer_type": answer_type,
        "auto_value": auto_value,
        "final_value": None,
        "source_status": source_status,
        "evidence_ids": evidence_ids or [],
        "explanation": explanation,
    }


def build_questions(person: dict[str, Any], decision: Any, narrative: str) -> list[dict[str, Any]]:
    c = person["counters"]
    tasks = person["tasks"]
    observations = person["observations"]
    verified = [item for item in observations if item["verified"]]
    additional_ids = [
        str(item["task_id"])
        for item in tasks
        if str(item["classification"]).startswith("additional_") and item.get("task_id")
    ]
    planned_task_ids = sorted(
        {
            str(item["task_id"])
            for item in tasks
            if item.get("attribution") == "planned_owner" and item.get("task_id")
        }
    )
    postponement_evidence_ids = sorted(
        {
            evidence_id
            for item in tasks
            for evidence_id in item.get("postponement_evidence_ids") or []
        }
    )
    meeting_task_ids = sorted(
        {
            str(item["task_id"])
            for item in tasks
            if item.get("meeting_origin_id") and item.get("task_id")
        }
    )
    absence_evidence_ids = sorted(
        attendance_id
        for attendance_id, item in (person.get("attendance") or {}).items()
        if item.get("type") == "MUNGESE"
    )
    verified_ids = [str(item["id"]) for item in verified]
    positive = [item for item in verified if item["marker"] == "POSITIVE"]
    negative = [item for item in verified if item["marker"] == "NEGATIVE"]
    requested = [
        item for item in positive
        if item["category"] == "EXTRA_TASK"
        and (item.get("evidence_json") or {}).get("kind") == "REQUESTED_EXTRA_TASK"
    ]
    helped = [item for item in positive if item["category"] == "HELPED_COLLEAGUE"]
    proposals = [item for item in positive if item["category"] == "PROPOSAL"]
    engagement_categories = {
        item["category"]
        for item in positive
        if item["category"] in {
            "EXTRA_TASK", "QUALITY", "TIME_SAVED", "HELPED_COLLEAGUE", "PROPOSAL"
        }
    }
    blockers = [
        item for item in negative
        if item["category"] == "BLOCKER"
        and (item.get("evidence_json") or {}).get("affected_user_id")
    ]
    repeated = [item for item in negative if item["category"] == "REPEATED_PROBLEM"]
    missed_meetings = [item for item in negative if item["category"] == "MISSED_MEETING"]
    task_status = {
        "planned": c.get("planned_count", 0),
        "completed_on_time": c.get("completed_on_time_count", 0),
        "completed_late": c.get("completed_late_count", 0),
        "in_progress": c.get("in_progress_count", 0),
        "pending": c.get("pending_confirmation_count", 0),
        "no_progress": c.get("no_progress_count", 0),
        "late_open": c.get("late_open_count", 0),
        "approved_postponements": c.get("approved_postponement_count", 0),
        "unapproved_postponements": c.get("unapproved_postponement_count", 0),
    }
    closed = (
        c.get("planned_count", 0) == c.get("accounted_planned_count", 0)
    )
    absence_needs_review = c.get("absence_needs_review_count", 0)
    questions = [
        _question(
            "task_status",
            task_status,
            evidence_ids=planned_task_ids,
            answer_type="object",
        ),
        _question(
            "new_tasks_added",
            {
                "yes": bool(c.get("additional_count", 0)),
                "count": c.get("additional_count", 0),
                "completed": c.get("additional_completed_count", 0),
                "open": c.get("additional_count", 0) - c.get("additional_completed_count", 0),
                "task_ids": additional_ids,
            },
            evidence_ids=additional_ids,
            answer_type="object",
        ),
        _question(
            "approved_postponement",
            {
                "approved": c.get("approved_postponement_count", 0),
                "unapproved": c.get("unapproved_postponement_count", 0),
                "needs_review": c.get("postponement_needs_review_count", 0),
            },
            source_status=(
                "AUTO_NEEDS_CONFIRMATION"
                if c.get("postponement_needs_review_count", 0)
                else "AUTO"
            ),
            evidence_ids=postponement_evidence_ids,
            answer_type="object",
        ),
        _question(
            "requested_extra_tasks",
            bool(requested),
            evidence_ids=[str(item["id"]) for item in requested],
            answer_type="boolean",
        ),
        _question(
            "helped_colleague",
            bool(helped),
            evidence_ids=[str(item["id"]) for item in helped],
            answer_type="boolean",
        ),
        _question(
            "extra_engagement",
            {"count": len(engagement_categories), "categories": sorted(engagement_categories)},
            evidence_ids=[str(item["id"]) for item in positive],
            answer_type="object",
        ),
        _question(
            "gave_proposal",
            bool(proposals),
            evidence_ids=[str(item["id"]) for item in proposals],
            answer_type="boolean",
        ),
        _question(
            "respected_meetings",
            False if c.get("meeting_missed_count", 0) else None,
            source_status=(
                "AUTO"
                if c.get("meeting_missed_count", 0)
                else "AUTO_NEEDS_CONFIRMATION"
            ),
            evidence_ids=sorted(
                set(meeting_task_ids)
                | {str(item["id"]) for item in missed_meetings}
            ),
            explanation=(
                "Ka evidencë të konfirmuar për takim të humbur."
                if c.get("meeting_missed_count", 0)
                else "Pa evidencë negative; prezenca duhet konfirmuar nga menaxheri."
            ),
            answer_type="boolean",
        ),
        _question(
            "closed_tasks",
            closed,
            evidence_ids=planned_task_ids,
            answer_type="boolean",
        ),
        _question(
            "frequent_delays",
            {
                "attendance_tardiness": c.get("tardiness_count", 0),
                "tasks_completed_late": c.get("completed_late_count", 0),
                "tasks_late_open": c.get("late_open_count", 0),
            },
            answer_type="object",
        ),
        _question(
            "unexpected_absences",
            None if absence_needs_review else c.get("unexcused_absence_days", 0),
            source_status="AUTO_NEEDS_CONFIRMATION" if absence_needs_review else "AUTO",
            evidence_ids=absence_evidence_ids,
            explanation=(
                "Burimi aktual i prezencës nuk dallon mungesën e arsyetuar nga ajo e papritur."
                if absence_needs_review else ""
            ),
            answer_type="integer",
        ),
        _question("week_positive", narrative, evidence_ids=[str(item["id"]) for item in positive], answer_type="text"),
        _question(
            "week_problems",
            [item.get("comment") for item in negative if item.get("comment")],
            evidence_ids=[str(item["id"]) for item in negative],
            answer_type="list",
        ),
        _question(
            "affected_other_plan",
            bool(blockers),
            evidence_ids=[str(item["id"]) for item in blockers],
            answer_type="boolean",
        ),
        _question(
            "repeated_after_clarification",
            bool(repeated),
            evidence_ids=[str(item["id"]) for item in repeated],
            answer_type="boolean",
        ),
        _question(
            "current_level",
            "—",
            source_status="NOT_APPLICABLE",
            explanation="Niveli aktual i punonjësit nuk ruhet ende në profil.",
        ),
        _question(
            "suggested_evaluation_level",
            decision.level.value,
            answer_type="level",
        ),
        _question("evaluation", decision.symbol.value, answer_type="symbol"),
        _question(
            "comments",
            {"automatic_narrative": narrative, "manager_comment": None, "override_reason": None},
            evidence_ids=verified_ids,
            answer_type="object",
        ),
    ]
    return questions


COUNTER_FIELDS = {
    "planned_count": "planned_count",
    "completed_on_time_count": "completed_on_time_count",
    "completed_late_count": "completed_late_count",
    "in_progress_count": "in_progress_count",
    "pending_confirmation_count": "pending_count",
    "no_progress_count": "no_progress_count",
    "additional_count": "additional_count",
    "approved_postponement_count": "approved_postponement_count",
    "unapproved_postponement_count": "unapproved_postponement_count",
    "tardiness_count": "tardiness_count",
    "approved_absence_days": "approved_absence_days",
    "unexcused_absence_days": "unexcused_absence_days",
    "diamond_count": "diamond_count",
    "positive_count": "positive_count",
    "negative_count": "negative_count",
    "neutral_count": "neutral_count",
    "proposal_count": "proposal_count",
    "helped_colleague_count": "helped_colleague_count",
    "time_saved_minutes": "time_saved_minutes",
    "repeated_problem_count": "repeated_problem_count",
}


def _task_progress_percent(task: dict[str, Any]) -> float:
    rows = task.get("daily_progress") or []
    usable = [row for row in rows if int(row.get("total_value") or 0) > 0]
    if usable:
        latest = usable[-1]
        completed = int(latest.get("completed_value") or 0)
        total = int(latest["total_value"])
        return round(min(100.0, max(0.0, completed * 100.0 / total)), 1)
    return 100.0 if task.get("classification") in {
        "completed_on_time",
        "completed_late",
        "additional_completed",
    } else 0.0


def build_project_progress(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aggregate MST/TT projects; all other projects remain task-level evidence."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    for task in tasks:
        title = str(task.get("project_title") or "").strip()
        normalized = title.upper()
        if not title or not (
            "MST" in normalized or normalized == "TT" or normalized.startswith("TT ")
        ):
            continue
        key = str(task.get("project_id") or title)
        grouped.setdefault(key, []).append(task)

    projects: list[dict[str, Any]] = []
    for project_key, project_tasks in sorted(grouped.items(), key=lambda item: item[0]):
        percentages = [_task_progress_percent(task) for task in project_tasks]
        projects.append(
            {
                "project_id": project_key,
                "project_title": project_tasks[0].get("project_title") or "MST/TT",
                "task_count": len(project_tasks),
                "progress_percent": round(sum(percentages) / len(percentages), 1),
                "method": "latest_daily_quantity_or_completed_task_average",
                "task_ids": [
                    str(task.get("task_id"))
                    for task in project_tasks
                    if task.get("task_id")
                ],
            }
        )
    return projects


async def calculate_weekly_period(
    db: AsyncSession,
    *,
    period: RealizationPeriod,
    planned_snapshot: Any,
    final_snapshot: Any,
    actor_id: uuid.UUID,
) -> tuple[list[RealizationPersonResult], RealizationDepartmentResult]:
    require_recalculable(period)
    if planned_snapshot is None or final_snapshot is None:
        raise ValueError("PLANNED and FINAL snapshots are required before calculation")
    policy = (
        await db.execute(
            select(RealizationPolicyVersion).where(
                RealizationPolicyVersion.id == period.policy_version_id
            )
        )
    ).scalar_one()
    evidence = await collect_weekly_evidence(
        db,
        period=period,
        planned_snapshot=planned_snapshot,
        final_snapshot=final_snapshot,
        am_cutoff=policy.am_cutoff,
        pm_cutoff=policy.pm_cutoff,
    )
    existing = {
        row.user_id: row
        for row in (
            await db.execute(
                select(RealizationPersonResult).where(
                    RealizationPersonResult.period_id == period.id
                )
            )
        ).scalars().all()
    }
    if any(row.reviewed_at is not None for row in existing.values()):
        raise ValueError("Recalculation is not allowed after any person result has been reviewed")
    eligible_user_ids = {uuid.UUID(user_id) for user_id in evidence["people"]}
    for user_id, stale_result in existing.items():
        if user_id not in eligible_user_ids:
            await db.delete(stale_result)
    results: list[RealizationPersonResult] = []
    level_counts: Counter[str] = Counter()
    all_task_keys: set[str] = set()
    for user_id_raw, person in sorted(evidence["people"].items()):
        user_id = uuid.UUID(user_id_raw)
        counters = dict(person["counters"])
        decision = evaluate_policy({"counters": counters}, policy.criteria_json, policy.bonus_json)
        narrative = build_albanian_narrative({"counters": counters})
        person["questions"] = build_questions(person, decision, narrative)
        person["decision"] = {
            "triggered_rule": decision.triggered_rule,
            "reasons": list(decision.reasons),
        }
        planned_count = int(counters.get("planned_count", 0))
        accounted_count = int(counters.get("accounted_planned_count", 0))
        person["weekly_progress_percent"] = (
            round(accounted_count * 100.0 / planned_count, 1)
            if planned_count
            else 100.0
        )
        person["project_progress"] = build_project_progress(person["tasks"])
        result = existing.get(user_id)
        if result is None:
            result = RealizationPersonResult(
                period_id=period.id,
                user_id=user_id,
                department_id=period.department_id,
            )
            db.add(result)
        result.facts_json = person
        for source_key, model_key in COUNTER_FIELDS.items():
            setattr(result, model_key, int(counters.get(source_key, 0)))
        result.system_task_count = sum(1 for item in person["tasks"] if item["source_type"] == "system")
        result.system_task_completed_count = sum(
            1
            for item in person["tasks"]
            if item["source_type"] == "system"
            and item["classification"] in {"completed_on_time", "completed_late", "additional_completed"}
        )
        result.meeting_missed_count = int(counters.get("meeting_missed_count", 0))
        result.suggested_level = decision.level.value
        result.suggested_symbol = decision.symbol.value
        result.suggested_bonus = None
        result.auto_narrative = narrative
        results.append(result)
        level_counts[decision.level.value] += 1
        all_task_keys.update(item["match_key"] for item in person["tasks"])

    department_result = (
        await db.execute(
            select(RealizationDepartmentResult).where(
                RealizationDepartmentResult.period_id == period.id,
                RealizationDepartmentResult.department_id == period.department_id,
            )
        )
    ).scalar_one_or_none()
    if department_result is None:
        department_result = RealizationDepartmentResult(
            period_id=period.id,
            department_id=period.department_id,
        )
        db.add(department_result)
    count = len(results)
    unique_department_tasks: dict[str, dict[str, Any]] = {}
    for person in evidence["people"].values():
        for task in person.get("tasks") or []:
            unique_department_tasks.setdefault(str(task.get("match_key")), task)
    department_result.facts_json = {
        "unique_task_count": len(evidence["department_unique_task_keys"]),
        "unique_planned_task_count": len(evidence["department_planned_task_keys"]),
        "unique_final_task_count": len(evidence["department_final_task_keys"]),
        "unique_additional_task_count": len(evidence["department_additional_task_keys"]),
        "unique_attributed_task_count": len(all_task_keys),
        "unassigned": evidence["unassigned"],
        "excluded_people": evidence["excluded_people"],
        "planned_snapshot_id": evidence["planned_snapshot_id"],
        "final_snapshot_id": evidence["final_snapshot_id"],
        "project_progress": build_project_progress(list(unique_department_tasks.values())),
    }
    department_result.a_plus_count = level_counts["A+"]
    department_result.a_count = level_counts["A"]
    department_result.b_count = level_counts["B"]
    department_result.c_count = level_counts["C"]
    department_result.m_count = level_counts["M"]
    department_result.d_count = level_counts["D"]
    department_result.e_count = level_counts["E"]
    department_result.a_rate = (
        Decimal((level_counts["A+"] + level_counts["A"]) * 100) / Decimal(count)
        if count
        else Decimal(0)
    )
    department_result.total_bonus = None
    department_result.average_bonus = None
    department_result.proposal_count = sum(row.proposal_count for row in results)
    department_result.time_saved_minutes = sum(row.time_saved_minutes for row in results)
    department_result.repeated_problem_count = sum(row.repeated_problem_count for row in results)
    department_result.department_suggestion = (
        f"{count} punonjës; {level_counts['A+'] + level_counts['A']} rezultate A/A+."
    )
    if period.status == RealizationPeriodStatus.OPEN.value:
        transition_period(period, RealizationPeriodStatus.CALCULATED, actor_id=actor_id)
    else:
        period.calculated_at = datetime.now(timezone.utc)
    await db.flush()
    return results, department_result
