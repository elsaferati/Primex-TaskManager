"""Send a selected update to the fixed internal Intelligence mailbox."""

from app.intelligence.models import NewsAnalysis, NewsItem, NewsSource
from app.intelligence.priority import news_priority
from app.services.primeflow_report import GmailService

INTELLIGENCE_RECIPIENT = "180primex.eu@gmail.com"


def _clean(value: str) -> str:
    return " ".join(value.split())


def news_email_content(item: NewsItem, source: NewsSource, analysis: NewsAnalysis) -> tuple[str, str]:
    title = _clean(item.title)
    subject = f"[PrimeFlow Intelligence] {title}"[:200]
    priority = news_priority(source.priority, analysis.importance_score, analysis.relevance_score)
    lines = [title, "", f"{analysis.category.title()} · {priority.title()} priority", f"Source: {_clean(source.name)}"]
    if item.published_at:
        lines.append(f"Published: {item.published_at.date().isoformat()}")
    lines.extend(["", _clean(analysis.summary)])
    if analysis.why_it_matters:
        lines.extend(["", "Why this matters", _clean(analysis.why_it_matters)])
    for label, value in (
        ("Deadline", analysis.deadline.isoformat() if analysis.deadline else None),
        ("Funding", analysis.funding_amount),
        ("Eligibility", analysis.eligibility),
    ):
        if value:
            lines.append(f"{label}: {_clean(value)}")
    lines.extend(["", f"Read original: {item.url}"])
    return subject, "\n".join(lines)


async def send_news_email(item: NewsItem, source: NewsSource, analysis: NewsAnalysis) -> None:
    subject, body = news_email_content(item, source, analysis)
    await GmailService().send_verified(subject, [INTELLIGENCE_RECIPIENT], body)
