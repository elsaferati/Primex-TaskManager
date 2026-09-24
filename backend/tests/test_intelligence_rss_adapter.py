from datetime import datetime, timezone

import pytest

from app.intelligence.rss_adapter import RSSAdapter, RSSCollectionError, parse_feed, rss_url_is_supported


def test_rss_entries_keep_direct_links_and_clean_text():
    payload = b"""<?xml version="1.0"?><rss version="2.0"><channel><title>Business news</title>
      <item><title>New funding call</title><link>https://example.org/news/grant-1</link>
      <guid>grant-1</guid><pubDate>Thu, 24 Sep 2026 08:00:00 GMT</pubDate>
      <description><![CDATA[<p>Applications close in October.</p><script>ignore me</script>]]></description></item>
      <item><title>Duplicate</title><link>https://example.org/news/grant-1</link></item>
      <item><title>Unsafe</title><link>javascript:alert(1)</link></item>
      <item><title>No link</title></item>
    </channel></rss>"""
    posts = parse_feed(payload, "https://example.org/feed.xml")
    assert len(posts) == 1
    assert posts[0].url == "https://example.org/news/grant-1"
    assert posts[0].external_id == "grant-1"
    assert posts[0].published_at == datetime(2026, 9, 24, 8, tzinfo=timezone.utc)
    assert "Applications close in October." in posts[0].original_text
    assert "ignore me" not in posts[0].original_text


def test_atom_entries_use_alternate_article_link_and_updated_date():
    payload = b"""<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <title>Events</title><entry><id>tag:example.org,2026:event-1</id><title>Business event</title>
      <updated>2026-09-23T12:30:00Z</updated><link rel="alternate" href="/events/1"/>
      <content type="html">&lt;p&gt;Prishtina, 8 October.&lt;/p&gt;</content>
      </entry></feed>"""
    posts = parse_feed(payload, "https://example.org/atom.xml")
    assert len(posts) == 1
    assert posts[0].url == "https://example.org/events/1"
    assert posts[0].published_at == datetime(2026, 9, 23, 12, 30, tzinfo=timezone.utc)
    assert "Prishtina, 8 October." in posts[0].original_text


def test_invalid_page_is_not_treated_as_a_feed():
    with pytest.raises(RSSCollectionError, match="RSS or Atom"):
        parse_feed(b"<html><body>News page</body></html>", "https://example.org/news")


def test_xml_entity_declarations_are_rejected():
    payload = b'''<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY injected "unsafe">]>
      <rss version="2.0"><channel><title>News</title><item><title>&injected;</title>
      <link>https://example.org/item</link></item></channel></rss>'''
    with pytest.raises(RSSCollectionError, match="entity declarations"):
        parse_feed(payload, "https://example.org/feed.xml")


def test_private_hosts_credentials_and_custom_ports_are_rejected():
    assert rss_url_is_supported("https://example.org/feed.xml")
    assert not rss_url_is_supported("http://127.0.0.1/feed")
    assert not rss_url_is_supported("http://10.0.0.5/feed")
    assert not rss_url_is_supported("http://localhost/feed")
    assert not rss_url_is_supported("http://example.local/feed")
    assert not rss_url_is_supported("https://user:pass@example.org/feed")
    assert not rss_url_is_supported("https://example.org:8443/feed")


def test_private_address_cannot_be_requested():
    with pytest.raises(RSSCollectionError, match="public"):
        RSSAdapter("http://127.0.0.1/feed")
