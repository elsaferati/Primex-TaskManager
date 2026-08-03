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

DEFAULT_ORDER = ("E", "D", "M", "C", "A+", "A", "B")


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
    symbols = {**DEFAULT_SYMBOLS, **(criteria.get("symbols") or {})}
    for level in RealizationLevel:
        try:
            RealizationSymbol(symbols[level.value])
        except (KeyError, ValueError) as exc:
            raise ValueError(f"Invalid symbol for {level.value}") from exc
    ordered = criteria.get("ordered_levels") or DEFAULT_ORDER
    normalized_order = [
        str(item.get("level")) if isinstance(item, dict) else str(item)
        for item in ordered
    ]
    if set(normalized_order) != {level.value for level in RealizationLevel}:
        raise ValueError("ordered_levels must contain every Realization level exactly once")
    for key in (
        "frequent_tardiness_threshold",
        "a_plus_verified_extra_min",
        "a_verified_extra_min",
        "unexpected_absence_e_threshold",
        "repeated_problem_d_threshold",
    ):
        if key in criteria and (
            not isinstance(criteria[key], int) or criteria[key] < 1
        ):
            raise ValueError(f"{key} must be a positive integer")


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
    minor_impact = int(counters.get("minor_negative_impact_count", 0)) > 0

    absence_e = int(criteria.get("unexpected_absence_e_threshold", 2))
    repeated_d = int(criteria.get("repeated_problem_d_threshold", 2))
    frequent_delay = int(criteria.get("frequent_tardiness_threshold", 3))
    a_plus_extra = int(criteria.get("a_plus_verified_extra_min", 2))
    a_extra = int(criteria.get("a_verified_extra_min", 1))

    obligations_accounted = int(
        counters.get(
            "accounted_planned_count",
            complete_on_time
            + complete_late
            + int(counters.get("approved_postponement_count", 0))
            + int(counters.get("removed_or_canceled_approved_count", 0)),
        )
    )
    unaccounted = max(0, planned - obligations_accounted)
    negative_without_minor_impact = negative > int(
        counters.get("minor_negative_impact_count", 0)
    )

    def rule(level: str) -> PolicyDecision | None:
        if level == "E":
            if unexpected_absence >= absence_e:
                return _decision(
                    "E",
                    "unexpected_absence",
                    [f"{unexpected_absence} unexpected absences"],
                    criteria,
                    bonuses,
                )
            if planned > 0 and no_progress >= planned:
                return _decision(
                    "E",
                    "no_real_progress",
                    ["No planned obligation has recorded progress"],
                    criteria,
                    bonuses,
                )
        elif level == "D":
            if unapproved > 0 or repeated >= repeated_d or major_impact:
                reasons = []
                if unapproved:
                    reasons.append(f"{unapproved} unapproved or rejected postponements")
                if repeated >= repeated_d:
                    reasons.append(f"{repeated} repeated problems")
                if major_impact:
                    reasons.append("Verified major negative impact")
                return _decision(
                    "D", "unapproved_or_major_failure", reasons, criteria, bonuses
                )
            if unaccounted or no_progress or late_open or negative_without_minor_impact:
                return _decision(
                    "D",
                    "partial_failure",
                    ["Planned obligations are incomplete or have negative evidence"],
                    criteria,
                    bonuses,
                )
        elif level == "M" and approved_absence and planned == obligations_accounted:
            return _decision(
                "M",
                "approved_absence",
                ["Approved absence with remaining obligations accounted for"],
                criteria,
                bonuses,
            )
        elif level == "C" and (
            complete_late or tardiness >= frequent_delay or minor_impact
        ):
            reasons = []
            if complete_late:
                reasons.append(f"{complete_late} task completions after the effective deadline")
            if tardiness >= frequent_delay:
                reasons.append(f"{tardiness} attendance tardiness events")
            if minor_impact:
                reasons.append("Verified minor impact caps the result at C")
            return _decision("C", "delay_or_minor_impact", reasons, criteria, bonuses)
        elif level == "A+" and planned > 0 and verified_extra >= a_plus_extra:
            return _decision(
                "A+",
                "multiple_verified_extras",
                [f"{verified_extra} verified positive extras"],
                criteria,
                bonuses,
            )
        elif level == "A" and planned > 0 and verified_extra >= a_extra:
            return _decision(
                "A",
                "verified_extra",
                [f"{verified_extra} verified positive extras"],
                criteria,
                bonuses,
            )
        elif level == "B":
            return _decision(
                "B",
                "no_planned_obligations" if planned == 0 else "complete_on_time",
                [
                    "No planned employee obligations"
                    if planned == 0
                    else "All planned obligations completed on time"
                ],
                criteria,
                bonuses,
            )
        return None

    ordered = criteria.get("ordered_levels") or DEFAULT_ORDER
    for configured in ordered:
        level = str(configured.get("level")) if isinstance(configured, dict) else str(configured)
        decision = rule(level)
        if decision is not None:
            return decision
    raise ValueError("Realization policy produced no decision")

