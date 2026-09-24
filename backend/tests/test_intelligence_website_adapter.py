from datetime import datetime, timezone

import pytest

from app.intelligence.collection import website_entry_is_current
from app.intelligence.website_adapter import WebsiteCollectionError, WebsiteEntry, parse_article, parse_listing, source_kind


def test_only_supported_official_listing_urls_are_collected():
    assert source_kind("https://kiesa.rks-gov.net/page.aspx?id=1,5") == "kiesa_news"
    assert source_kind("https://kiesa.rks-gov.net/page.aspx?id=1,134") == "kiesa_calls"
    assert source_kind("https://digital-strategy.ec.europa.eu/en/funding") == "eu_funding"
    assert source_kind("https://digital-strategy.ec.europa.eu/en/news") == "eu_news"
    assert source_kind("https://kiesa.rks-gov.net.evil.test/page.aspx?id=1,5") is None
    assert source_kind("http://kiesa.rks-gov.net/page.aspx?id=1,5") is None


def test_kiesa_listing_and_article_keep_the_direct_announcement_link():
    listing = '<a href="Page.aspx?id=1,5,1201">Grant for SMEs</a><a href="Page.aspx?id=1,5,1201">Grant for SMEs</a>'
    entries = parse_listing(listing, "https://kiesa.rks-gov.net/page.aspx?id=1,5")
    assert len(entries) == 1
    assert entries[0].url == "https://kiesa.rks-gov.net/Page.aspx?id=1,5,1201"
    article = '<div id="MainContent_ctl00_pnlLajmetDetails"><h2>Grant for SMEs</h2><p>Prishtinë, 21/09/2026</p><p>Applications are open until October.</p></div>'
    post = parse_article(article, entries[0])
    assert post.title == "Grant for SMEs"
    assert post.published_at == datetime(2026, 9, 21, tzinfo=timezone.utc)
    assert "Applications are open" in post.original_text
    assert post.url == entries[0].url


def test_eu_funding_card_preserves_deadline_and_only_follows_exact_card():
    html = '''<article class="ecl-content-item"><ul><li class="ecl-content-block__primary-meta-item">Call for proposals</li>
    <li class="ecl-content-block__primary-meta-item">01 September 2026 - 14 January 2027</li></ul>
    <a href="/en/funding/cyber-call"><span>Cybersecurity call</span></a>
    <div class="ecl-content-block__description"><p>Support for SMEs.</p></div></article>
    <article class="ecl-content-item"><a href="https://evil.test/en/funding/fake">Fake call</a></article>'''
    entries = parse_listing(html, "https://digital-strategy.ec.europa.eu/en/funding")
    assert len(entries) == 1
    assert entries[0].url == "https://digital-strategy.ec.europa.eu/en/funding/cyber-call"
    assert "14 January 2027" in entries[0].text
    assert entries[0].published_at == datetime(2026, 9, 1, tzinfo=timezone.utc)
    assert entries[0].closes_at == datetime(2027, 1, 14, tzinfo=timezone.utc)


def test_missing_article_links_is_a_visible_collection_error():
    with pytest.raises(WebsiteCollectionError, match="No article links"):
        parse_listing("<html><body>No calls today</body></html>", "https://digital-strategy.ec.europa.eu/en/funding")


def test_news_article_uses_its_publication_date_and_content():
    entry = parse_listing(
        '<article class="ecl-content-item"><li class="ecl-content-block__primary-meta-item">31 August 2026</li>'
        '<a href="/en/news/digital-act">Digital Act update</a></article>',
        "https://digital-strategy.ec.europa.eu/en/news",
    )[0]
    article = '<h1 class="ecl-page-header__title">Digital Act update</h1>' \
        '<ul class="ecl-page-header__meta"><li>Publication 31 August 2026</li></ul>' \
        '<main><article><p>The Commission announced new rules.</p></article></main>'
    post = parse_article(article, entry)
    assert post.published_at == datetime(2026, 8, 31, tzinfo=timezone.utc)
    assert post.original_text == "The Commission announced new rules."
    assert post.url.endswith("/en/news/digital-act")


def test_open_funding_call_is_current_even_when_it_opened_months_ago():
    now = datetime(2026, 9, 24, tzinfo=timezone.utc)
    open_call = WebsiteEntry("https://digital-strategy.ec.europa.eu/en/funding/call", "Call", "Call", datetime(2026, 4, 21, tzinfo=timezone.utc), datetime(2026, 10, 1, tzinfo=timezone.utc))
    closed_call = WebsiteEntry("https://digital-strategy.ec.europa.eu/en/funding/old", "Old", "Old", datetime(2026, 9, 1, tzinfo=timezone.utc), datetime(2026, 9, 23, tzinfo=timezone.utc))
    assert website_entry_is_current(open_call, now)
    assert not website_entry_is_current(closed_call, now)
