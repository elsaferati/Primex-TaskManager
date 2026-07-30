from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models.enums import RealizationLevel, RealizationSymbol


@dataclass(frozen=True)
class PolicyDecision:
    level: RealizationLevel
    symbol: RealizationSymbol
    bonus: int
    reasons: tuple[str, ...]
    triggered_rule: str


DEFAULT_SYMBOLS = {
    "A+": "+",
    "A": "+",
    "B": "+",
    "C": "+/-",
    "M": "+/-",
    "D": "-",
    "E": "-",
}


def validate_policy(criteria: dict[str, Any], bonuses: dict[str, Any]) -> None:
    if criteria.get("algorithm") != "first_matching_rule":
        raise ValueError("Realization policy must use first_matching_rule")
    missing_bonuses = {level.value for level in RealizationLevel} - set(bonuses)
    if missing_bonuses:
        raise ValueError(f"Realization policy bonuses missing: {sorted(missing_bonuses)}")
    for level in RealizationLevel:
        value = bonuses[level.value]
        if not isinstance(value, (int, float)) or value < 0:
            raise ValueError(f"Invalid bonus for {level.value}")


def _decision(
    level: str,
    rule: str,
    reasons: list[str],
    criteria: dict[str, Any],
    bonuses: dict[str, Any],
) -> PolicyDecision:
    symbols = {**DEFAULT_SYMBOLS, **(criteria.get("symbols") or {})}
    return PolicyDecision(
        level=RealizationLevel(level),
        symbol=RealizationSymbol(symbols[level]),
        bonus=int(bonuses[level]),
        reasons=tuple(reasons),
        triggered_rule=rule,
    )


def evaluate_policy(
    facts: dict[str, Any],
    criteria: dict[str, Any],
    bonuses: dict[str, Any],
) -> PolicyDecision:
    """Apply the pinned policy without querying or mutating the database."""
    validate_policy(criteria, bonuses)
    counters = facts.get("counters") or facts
    planned = int(counters.get("planned_count", 0))
    complete_on_time = int(counters.get("completed_on_time_count", 0))
    complete_late = int(counters.get("completed_late_count", 0))
    no_progress = int(counters.get("no_progress_count", 0))
    late_open = int(counters.get("late_open_count", 0))
    unapproved = int(counters.get("unapproved_postponement_count", 0))
    approved_absence = int(counters.get("approved_absence_days", 0))
    unexpected_absence = int(counters.get("unexcused_absence_days", 0))
    repeated = int(counters.get("repeated_problem_count", 0))
    negative = int(counters.get("negative_count", 0))
    verified_extra = int(counters.get("verified_extra_count", 0))
    tardiness = int(counters.get("tardiness_count", 0))
    major_impact = bool(counters.get("major_negative_impact"))

    absence_e = int(criteria.get("unexpected_absence_e_threshold", 2))
    repeated_d = int(criteria.get("repeated_problem_d_threshold", 2))
    frequent_delay = int(criteria.get("frequent_tardiness_threshold", 3))
    a_plus_extra = int(criteria.get("a_plus_verified_extra_min", 2))
    a_extra = int(criteria.get("a_verified_extra_min", 1))

    if unexpected_absence >= absence_e:
        return _decision("E", "unexpected_absence", [f"{unexpected_absence} unexpected absences"], criteria, bonuses)
    if planned > 0 and no_progress >= planned:
        return _decision("E", "no_real_progress", ["No planned obligation has recorded progress"], criteria, bonuses)
    if unapproved > 0 or repeated >= repeated_d or major_impact:
        reasons = []
        if unapproved:
            reasons.append(f"{unapproved} unapproved postponements")
        if repeated >= repeated_d:
            reasons.append(f"{repeated} repeated problems")
        if major_impact:
            reasons.append("Verified major negative impact")
        return _decision("D", "unapproved_or_major_failure", reasons, criteria, bonuses)

    obligations_accounted = (
        complete_on_time
        + complete_late
        + int(counters.get("approved_postponement_count", 0))
        + int(counters.get("removed_or_canceled_approved_count", 0))
    )
    if planned > obligations_accounted or no_progress or late_open or negative:
        return _decision("D", "partial_failure", ["Planned obligations are incomplete or have negative evidence"], criteria, bonuses)
    if approved_absence and planned == obligations_accounted:
        return _decision("M", "approved_absence", ["Approved absence with remaining obligations accounted for"], criteria, bonuses)
    if complete_late or tardiness >= frequent_delay:
        return _decision("C", "frequent_delays", ["Work completed with delays"], criteria, bonuses)
    if planned == 0:
        return _decision("B", "no_planned_obligations", ["No planned employee obligations"], criteria, bonuses)
    if verified_extra >= a_plus_extra:
        return _decision("A+", "multiple_verified_extras", [f"{verified_extra} verified positive extras"], criteria, bonuses)
    if verified_extra >= a_extra:
        return _decision("A", "verified_extra", [f"{verified_extra} verified positive extras"], criteria, bonuses)
    return _decision("B", "complete_on_time", ["All planned obligations completed on time"], criteria, bonuses)

