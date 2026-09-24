import asyncio
import smtplib
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.intelligence.email_service import INTELLIGENCE_RECIPIENT, news_email_content, send_news_email
from app.intelligence.priority import news_priority
from app.intelligence.router import email_item


def test_high_priority_requires_importance_and_relevance():
    assert news_priority("NORMAL", 80, 70) == "HIGH"
    assert news_priority("NORMAL", 95, 69) == "NORMAL"
    assert news_priority("NORMAL", 79, 95) == "NORMAL"
    assert news_priority("HIGH", 70, 60) == "HIGH"
    assert news_priority("HIGH", 69, 95) == "NORMAL"
    assert news_priority("LOW", 90, 80) == "HIGH"
    assert news_priority("LOW", 89, 95) == "NORMAL"


def _news():
    item = SimpleNamespace(
        title="  Digital grant\nfor SMEs  ",
        url="https://example.org/grants/123",
        published_at=datetime(2026, 9, 24, tzinfo=timezone.utc),
    )
    source = SimpleNamespace(name="KIESA", priority="NORMAL")
    analysis = SimpleNamespace(
        category="GRANT", importance_score=88, relevance_score=83,
        summary="Applications are open for Kosovo SMEs.",
        why_it_matters="Relevant for local technology companies.",
        deadline=date(2026, 10, 18), funding_amount="€50,000", eligibility="Kosovo SMEs",
    )
    return item, source, analysis


def test_email_contains_direct_link_and_useful_context():
    subject, body = news_email_content(*_news())
    assert subject == "[PrimeFlow Intelligence] Digital grant for SMEs"
    assert "Grant · High priority" in body
    assert "Applications are open" in body
    assert "Why this matters" in body
    assert "Deadline: 2026-10-18" in body
    assert "Read original: https://example.org/grants/123" in body


def test_email_uses_existing_smtp_service_and_fixed_recipient(monkeypatch):
    send_verified = AsyncMock()
    monkeypatch.setattr("app.intelligence.email_service.GmailService", lambda: SimpleNamespace(send_verified=send_verified))
    asyncio.run(send_news_email(*_news()))
    send_verified.assert_awaited_once()
    subject, recipients, body = send_verified.await_args.args
    assert subject.startswith("[PrimeFlow Intelligence]")
    assert recipients == [INTELLIGENCE_RECIPIENT] == ["180primex.eu@gmail.com"]
    assert "https://example.org/grants/123" in body


def test_repeated_click_does_not_send_the_same_item_again(monkeypatch):
    item, source, analysis = _news()
    state = SimpleNamespace(emailed_at=None)
    send = AsyncMock()
    monkeypatch.setattr("app.intelligence.router.send_news_email", send)
    db = SimpleNamespace(execute=AsyncMock(), commit=AsyncMock(), rollback=AsyncMock())
    user = SimpleNamespace(id=uuid.uuid4())
    item_id = uuid.uuid4()

    async def click():
        db.execute.side_effect = [
            SimpleNamespace(one_or_none=lambda: (item, source, analysis)),
            None,
            SimpleNamespace(scalar_one=lambda: state),
        ]
        return await email_item(item_id, db, user)

    first = asyncio.run(click())
    second = asyncio.run(click())
    assert first.alreadySent is False
    assert second.alreadySent is True
    assert first.sentAt == second.sentAt
    send.assert_awaited_once_with(item, source, analysis)
    db.commit.assert_awaited_once()


def test_smtp_auth_failure_is_reported_without_exposing_credentials(monkeypatch):
    item, source, analysis = _news()
    state = SimpleNamespace(emailed_at=None)
    monkeypatch.setattr("app.intelligence.router.send_news_email", AsyncMock(side_effect=smtplib.SMTPAuthenticationError(535, b"Secret server response")))
    db = SimpleNamespace(
        execute=AsyncMock(side_effect=[
            SimpleNamespace(one_or_none=lambda: (item, source, analysis)),
            None,
            SimpleNamespace(scalar_one=lambda: state),
        ]),
        commit=AsyncMock(), rollback=AsyncMock(),
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(email_item(uuid.uuid4(), db, SimpleNamespace(id=uuid.uuid4())))
    assert error.value.status_code == 502
    assert "authentication failed" in error.value.detail
    assert "Secret server response" not in error.value.detail
    db.rollback.assert_awaited_once()
    db.commit.assert_not_awaited()
