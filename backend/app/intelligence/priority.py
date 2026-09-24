"""Derive an update's priority from its analysis and the source preference."""


def news_priority(source_priority: str, importance: int, relevance: int) -> str:
    thresholds = {
        "HIGH": (70, 60),
        "NORMAL": (80, 70),
        "LOW": (90, 80),
    }
    minimum_importance, minimum_relevance = thresholds.get(source_priority, thresholds["NORMAL"])
    return "HIGH" if importance >= minimum_importance and relevance >= minimum_relevance else "NORMAL"
