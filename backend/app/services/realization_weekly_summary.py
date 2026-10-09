"""Dated daily evidence and explainable, advisory weekly letters."""
from __future__ import annotations

from app.services.realization_calculator import MANDATORY_MANUAL_QUESTION_KEYS


def rollup_daily_answers(days: list[dict]) -> dict[str, dict]:
    """Existence questions use any Yes; meeting compliance requires every day.

    Missing days are never a No. Explicit weekly answers are applied afterwards.
    """
    result = {}
    applicable = [day for day in days if not day.get("on_leave") and not day.get("future")]
    for key in MANDATORY_MANUAL_QUESTION_KEYS:
        entries = [
            {**answer, "date": day["date"]}
            for day in applicable
            if (answer := (day.get("manual_answers") or {}).get(key)) is not None
            and isinstance(answer.get("value"), bool)
        ]
        if not entries:
            continue
        complete = len(entries) == len(applicable)
        values = [entry["value"] for entry in entries]
        value = (False if False in values else True if complete else None) if key == "respected_meetings" else (
            True if True in values else False if complete else None
        )
        if value is None:
            continue
        result[key] = {
            "value": value,
            "comment": "\n".join(f"{entry['date']}: {entry['comment']}" for entry in entries if entry.get("comment")),
            "evidence_ids": list(dict.fromkeys(eid for entry in entries for eid in entry.get("evidence_ids", []))),
            "source": "DAILY_ROLLUP", "history": entries,
        }
    return result


def suggest_weekly_level(facts: dict) -> dict:
    """Suggestion only: never changes payroll, task metrics or a manager decision."""
    answers = facts.get("manual_answers") or {}
    def yes(key):
        return answers.get(key, {}).get("value") is True

    planned = int(facts.get("weekly_planned_count") or 0)
    done = int(facts.get("weekly_completed_count") or 0)
    extra = int(facts.get("weekly_additional_completed_count") or 0)
    progress = int(facts.get("weekly_in_progress_task_count") or 0)
    wfe = int(facts.get("weekly_wfe_count") or 0)
    postponed = int(facts.get("weekly_postponed_task_count") or 0)
    timeline = facts.get("daily_timeline") or []
    delays = {day["date"] for day in timeline for entry in day.get("attendance", []) if entry.get("type") == "VONESE"}
    absences = {day["date"] for day in timeline for entry in day.get("attendance", []) if entry.get("type") == "MUNGESE"}
    # An absence without an explicit classification cannot be called unexcused.
    unexcused = {
        str(obs.get("evidence_json", {}).get("date"))
        for obs in facts.get("observations", [])
        if obs.get("verified") and obs.get("category") == "ABSENCE"
        and obs.get("evidence_json", {}).get("classification") == "UNEXCUSED"
    }
    approved_personal = {
        str(obs.get("evidence_json", {}).get("date"))
        for obs in facts.get("observations", [])
        if obs.get("verified") and obs.get("category") == "ABSENCE"
        and obs.get("evidence_json", {}).get("classification") == "APPROVED_PERSONAL"
    }
    missing = sorted(key for key in MANDATORY_MANUAL_QUESTION_KEYS
                     if not isinstance(answers.get(key, {}).get("value"), bool))
    pending = list(missing)
    if absences - unexcused - approved_personal:
        pending.append("absence_classification")
    if any(not day.get("on_leave") and day.get("daily_progress_percent") is None for day in timeline):
        pending.append("daily_reports")
    if any(day.get("future") for day in timeline):
        pending.append("week_in_progress")

    def decision(level, reason):
        return {"level": level, "reasons": [reason], "provisional": bool(pending), "missing": pending,
                "rule_version": "weekly-summary-v2", "answers_complete": not missing}

    if missing:
        return decision(None, f"Plotëso dhe ruaj {len(missing)} përgjigjet e mbetura për të marrë propozimin.")

    if facts.get("availability_status") == "PV":
        return decision("B", "Pushim vjetor gjatë gjithë javës.")
    if len(unexcused) >= 2:
        return decision("E", "Dy ose më shumë mungesa të konfirmuara pa arsyetim.")
    if not planned:
        return decision(None, "Nuk ka plan bazë të mjaftueshëm për propozim.")
    if not any(day.get("daily_progress_percent") is not None for day in timeline):
        return decision(None, "Mungojnë raportet ditore për propozim.")
    complete = planned > 0 and done >= planned
    postponement_facts = next((q.get("auto_value") or {} for q in facts.get("questions", []) if q.get("key") == "approved_postponement"), {})
    approved_count = int(postponement_facts.get("approved") or 0) if isinstance(postponement_facts, dict) else 0
    # The current weekly plan uses unique tasks, not stale daily snapshot totals.
    if "weekly_approved_postponed_task_count" in facts:
        approved_count = int(facts["weekly_approved_postponed_task_count"] or 0)
    accepted = done + postponed >= planned and postponed > 0 and approved_count >= postponed and yes("approved_postponement")
    if not complete and not accepted:
        if not done and not extra and not progress and not wfe:
            return decision("E", "Plani ka detyra, por nuk ka realizim apo progres të regjistruar.")
        return decision("D", "Plani mbetet i papërfunduar; shtyrjet e mbetura nuk janë konfirmuar plotësisht.")
    if answers.get("respected_meetings", {}).get("value") is False:
        return decision("D", "Ka takim të konfirmuar si të parespektuar.")
    if yes("affected_other_plan") or yes("repeated_after_clarification") or yes("week_problems"):
        return decision("C", "Ka problem, përsëritje ose ndikim negativ të regjistruar; përgjegjësi vlerëson rëndësinë.")
    if len(delays) >= 3 or unexcused:
        return decision("C", "Plani është mbuluar, por ka vonesa të shpeshta ose mungesë të pajustifikuar.")
    if approved_personal:
        return decision("M", "Mungesë personale e miratuar; detyrat e punës janë mbuluar.")
    extras = sum([yes("requested_extra_tasks"), yes("helped_colleague"), yes("gave_proposal"), extra > 0])
    if complete and extras >= 2:
        return decision("A+", "Plani i përfunduar dhe të paktën dy forma angazhimi shtesë.")
    if complete and extras == 1:
        return decision("A", "Plani i përfunduar dhe një formë angazhimi shtesë.")
    return decision("B", "Plani i përfunduar ose pjesa e mbetur e shtyrë me konfirmim.")
