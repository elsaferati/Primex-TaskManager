from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from typing import Any, Iterable

from app.models.enums import RealizationPulse
from app.services.system_task_schedule import _is_working_day


@dataclass(frozen=True)
class PulseDecision:
    pulse: RealizationPulse
    reason: str
    expected_count: int
    completed_count: int
    delta_to_plan: int
    justified_shortfall: int
    unresolved_pink_count: int
    missing_comment_count: int
    unresolved_negative_count: int
    unverified_extra_count: int
    verified_extra_count: int
    verified_diamond_count: int

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["pulse"] = self.pulse.value
        return payload


def _count(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def calculate_pulse(facts: dict[str, Any]) -> PulseDecision:
    """Calculate an operational Pulse without changing source completion counters."""
    counters = facts.get("counters") or facts
    expected = _count(
        facts.get("expected_cumulative_count", counters.get("weekly_expected_count", counters.get("planned_count")))
    )
    completed = _count(
        facts.get("actual_cumulative_count", counters.get("weekly_completed_count", counters.get("completed_count", counters.get("completed_on_time_count"))))
    )
    pink = _count(facts.get("unresolved_pink_count", counters.get("no_progress_count")))
    missing_comments = _count(facts.get("missing_comment_count", counters.get("missing_comment_count")))
    unresolved_negatives = _count(
        facts.get("unresolved_negative_count", counters.get("unresolved_negative_count"))
    )
    approved_postponements = _count(counters.get("approved_postponement_count"))
    approved_absence = _count(counters.get("approved_absence_days"))
    approved_priority = _count(counters.get("approved_priority_change_count"))
    verified_blockers = _count(counters.get("verified_external_blocker_count"))
    manager_justified = _count(counters.get("manager_justified_count"))
    justified = _count(
        facts.get(
            "justified_shortfall_count",
            approved_postponements
            + approved_absence
            + approved_priority
            + verified_blockers
            + manager_justified,
        )
    )
    unverified_extra = _count(
        facts.get("unverified_extra_count", counters.get("unverified_extra_count", counters.get("additional_count")))
    )
    verified_extra = _count(
        facts.get("verified_extra_count", counters.get("verified_extra_count"))
    )
    verified_diamond = _count(
        facts.get("verified_diamond_count", counters.get("verified_diamond_count", counters.get("diamond_count")))
    )
    shortfall = max(0, expected - completed)
    obligations_accounted = completed + justified >= expected

    common = dict(
        expected_count=expected,
        completed_count=completed,
        delta_to_plan=completed - expected,
        justified_shortfall=min(shortfall, justified),
        unresolved_pink_count=pink,
        missing_comment_count=missing_comments,
        unresolved_negative_count=unresolved_negatives,
        unverified_extra_count=unverified_extra,
        verified_extra_count=verified_extra,
        verified_diamond_count=verified_diamond,
    )
    if expected == 0:
        return PulseDecision(
            RealizationPulse.JUSTIFIED,
            "Pa obligime të planifikuara.",
            **common,
        )
    if missing_comments or pink or unresolved_negatives or not obligations_accounted:
        details = []
        if shortfall > justified:
            details.append(f"{shortfall - justified} obligime nën plan pa arsyetim")
        if pink:
            details.append(f"{pink} detyra Pink pa zgjidhje")
        if missing_comments:
            details.append(f"{missing_comments} komente të detyrueshme mungojnë")
        if unresolved_negatives:
            details.append(f"{unresolved_negatives} evidenca negative të pazgjidhura")
        return PulseDecision(
            RealizationPulse.ACTION_REQUIRED,
            "; ".join(details) or "Kërkohet veprim.",
            **common,
        )
    if shortfall:
        return PulseDecision(
            RealizationPulse.JUSTIFIED,
            f"{shortfall} obligime nën plan janë të arsyetuara me evidencë të aprovuar.",
            **common,
        )
    if verified_diamond and obligations_accounted:
        return PulseDecision(
            RealizationPulse.DIAMOND,
            "Obligimet janë të mbuluara dhe ka kontribut ekstra DIAMOND të verifikuar.",
            **common,
        )
    if completed > expected:
        return PulseDecision(
            RealizationPulse.ABOVE_PLAN,
            f"Rezultati është {completed - expected} mbi planin kumulativ.",
            **common,
        )
    return PulseDecision(
        RealizationPulse.ON_PLAN,
        "Plani kumulativ është arritur pa evidencë negative të pazgjidhur.",
        **common,
    )


def working_days(start: date, end: date) -> list[date]:
    days: list[date] = []
    current = start
    while current <= end:
        if _is_working_day(current):
            days.append(current)
        current += timedelta(days=1)
    return days


def build_recovery(
    *,
    decision: PulseDecision,
    weekly_planned_count: int,
    as_of_day: date,
    week_end: date,
) -> dict[str, Any]:
    remaining_days = len([day for day in working_days(as_of_day + timedelta(days=1), week_end)])
    remaining_obligations = max(0, _count(weekly_planned_count) - decision.completed_count)
    required_for_plus = max(0, decision.expected_count - decision.completed_count - decision.justified_shortfall)
    messages = []
    if decision.delta_to_plan < 0:
        messages.append(f"Je {abs(decision.delta_to_plan)} detyra nën plan.")
    else:
        messages.append("Je në nivelin e planit kumulativ.")
    messages.append(f"Kanë mbetur {remaining_days} ditë pune.")
    messages.append(
        f"Për të dalë +: duhen mbyllur edhe {required_for_plus} obligime të planit."
        if required_for_plus
        else "Për të dalë +: ruaj obligimet e planit të mbuluara."
    )
    messages.append("Për ++: duhet të tejkalohet targeti aktual me rezultat të matshëm.")
    if decision.unresolved_pink_count:
        messages.append(f"{decision.unresolved_pink_count} detyra janë Pink pa arsye të aprovuar.")
    return {
        "expected_cumulative": decision.expected_count,
        "actual_cumulative": decision.completed_count,
        "delta_to_plan": decision.delta_to_plan,
        "remaining_planned_obligations": remaining_obligations,
        "remaining_working_days": remaining_days,
        "unresolved_pink": decision.unresolved_pink_count,
        "justified_shortfall": decision.justified_shortfall,
        "unverified_extra": decision.unverified_extra_count,
        "verified_extra": decision.verified_extra_count,
        "required_for_plus": required_for_plus,
        "messages": messages,
    }


def aggregate_monthly_pulses(weekly_rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    rows = list(weekly_rows)
    counts = Counter(str(row.get("pulse")) for row in rows)
    unresolved_pink_days = sum(_count(row.get("unresolved_pink_days")) for row in rows)
    verified_positive = sum(_count(row.get("verified_positive_extras")) for row in rows)
    unresolved_negative = sum(_count(row.get("unresolved_negative_count")) for row in rows)
    verified_negative = sum(_count(row.get("verified_negative_count")) for row in rows)
    trend = [str(row.get("pulse")) for row in rows if row.get("pulse")]
    current = trend[-1] if trend else None
    if counts[RealizationPulse.ACTION_REQUIRED.value]:
        current = RealizationPulse.ACTION_REQUIRED.value
    elif counts[RealizationPulse.DIAMOND.value]:
        current = RealizationPulse.DIAMOND.value
    return {
        "weekly_history": rows,
        "plus_count": counts[RealizationPulse.ON_PLAN.value],
        "plus_plus_count": counts[RealizationPulse.ABOVE_PLAN.value],
        "diamond_count": counts[RealizationPulse.DIAMOND.value],
        "question_count": counts[RealizationPulse.ACTION_REQUIRED.value],
        "ok_count": counts[RealizationPulse.JUSTIFIED.value],
        "unresolved_pink_days": unresolved_pink_days,
        "verified_positive_extras": verified_positive,
        "unresolved_negative_evidence": unresolved_negative,
        "verified_negative_evidence": verified_negative,
        "trend": trend,
        "current_pulse": current,
    }
