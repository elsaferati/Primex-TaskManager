from __future__ import annotations

from typing import Any


def build_albanian_narrative(facts: dict[str, Any]) -> str:
    counters = facts.get("counters") or facts
    planned = int(counters.get("planned_count", 0))
    on_time = int(counters.get("completed_on_time_count", 0))
    late = int(counters.get("completed_late_count", 0))
    verified_extra = int(counters.get("verified_extra_count", 0))
    helped = int(counters.get("helped_colleague_count", 0))
    no_progress = int(counters.get("no_progress_count", 0))
    tardiness = int(counters.get("tardiness_count", 0))
    unexpected = int(counters.get("unexcused_absence_days", 0))

    parts: list[str] = []
    if planned:
        parts.append(f"Përfundoi në kohë {on_time} nga {planned} obligime javore")
        if late:
            parts.append(f"{late} detyrë(a) u përfunduan me vonesë")
    else:
        parts.append("Nuk kishte obligime të planifikuara në snapshot")
    if verified_extra:
        parts.append(f"realizoi {verified_extra} kontribut(e) shtesë të verifikuar")
    if helped:
        parts.append(f"ndihmoi kolegë në {helped} rast(e) të verifikuara")
    negatives: list[str] = []
    if no_progress:
        negatives.append(f"{no_progress} detyrë(a) pa progres")
    if tardiness:
        negatives.append(f"{tardiness} vonesë(a) në prezencë")
    if unexpected:
        negatives.append(f"{unexpected} mungesë(a) që kërkojnë konfirmim")
    if negatives:
        parts.append("U regjistruan " + ", ".join(negatives))
    else:
        parts.append("Nuk u regjistruan vonesa ose mungesa të papritura")
    return ". ".join(parts) + "."

