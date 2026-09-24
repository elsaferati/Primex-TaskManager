import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import httpx
import pytest

from app.intelligence.collection import collection_start_date
from app.intelligence.linkedin_adapter import BrightDataLinkedInAdapter, LinkedInCollectionError, parse_posts
from app.intelligence.schemas import NewsSourceCreate


def test_posts_keep_only_direct_links_and_parse_publication_date():
    source = SimpleNamespace(name="Example")
    posts = parse_posts([
        {"id": "42", "url": "https://www.linkedin.com/posts/example_update-42", "post_text": "A new grant opened.", "date_posted": "2026-09-24T09:00:00Z"},
        {"id": "43", "url": "https://www.linkedin.com/in/example/", "post_text": "Profile page"},
    ], source)
    assert len(posts) == 1
    assert posts[0].url.endswith("example_update-42")
    assert posts[0].published_at.isoformat() == "2026-09-24T09:00:00+00:00"


def test_linkedin_source_requires_profile_or_company_page():
    valid = {"name": "Example", "type": "LINKEDIN", "url": "https://www.linkedin.com/company/example/"}
    assert NewsSourceCreate(**valid).type == "LINKEDIN"
    with pytest.raises(ValueError):
        NewsSourceCreate(**{**valid, "url": "https://www.linkedin.com/feed/"})


def test_provider_trigger_uses_profile_discovery_and_snapshot_flow():
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/trigger"):
            return httpx.Response(200, json={"snapshot_id": "sd_example123"})
        if request.url.path.endswith("/progress/sd_example123"):
            return httpx.Response(200, json={"status": "ready"})
        return httpx.Response(200, json=[{"id": "42", "url": "https://www.linkedin.com/feed/update/urn:li:activity:42", "post_text": "New opportunity"}])

    adapter = BrightDataLinkedInAdapter("test-token", "test-dataset")
    adapter._client = lambda: httpx.AsyncClient(
        base_url="https://api.brightdata.com/datasets/v3/",
        transport=httpx.MockTransport(respond),
        headers={"Authorization": "Bearer test-token"},
    )
    source = SimpleNamespace(name="Example", url="https://www.linkedin.com/in/example/")

    async def exercise() -> None:
        snapshot = await adapter.trigger(source, start_date="2026-09-23", end_date="2026-09-24")
        assert snapshot == "sd_example123"
        assert await adapter.progress(snapshot) == "ready"
        assert len(await adapter.download(snapshot, source)) == 1

    asyncio.run(exercise())
    assert requests[0].url.params["discover_by"] == "profile_url"


def test_provider_rejects_results_without_post_links():
    with pytest.raises(LinkedInCollectionError):
        parse_posts([{"url": "https://www.linkedin.com/in/example/"}], SimpleNamespace(name="Example"))


def test_first_check_covers_recent_posts_then_uses_incremental_window():
    now = datetime(2026, 9, 24, 9, 0, tzinfo=timezone.utc)
    assert collection_start_date(None, now) == "2026-07-26"
    assert collection_start_date(datetime(2026, 9, 20, tzinfo=timezone.utc), now) == "2026-09-19"
