"""Acceptance tests for Feature 1 (OG cards) and Feature 2 (SSR).

Run: cd /app/backend && python -m pytest tests/ -v
"""
import os
import re
import time
import pytest
import httpx

API = os.environ.get("REACT_APP_BACKEND_URL_FOR_TESTS")
if not API:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                API = line.split("=", 1)[1].strip().strip('"')
                break
BASE = f"{API}/api"

# Global session to reuse HTTP/2 connections
client = httpx.Client(timeout=30, follow_redirects=True)


@pytest.fixture(scope="module")
def first_story():
    r = client.get(f"{BASE}/feed")
    r.raise_for_status()
    stories = r.json()["stories"]
    assert stories, "No stories in feed — pipeline must run first"
    return stories[0]


@pytest.fixture(scope="module")
def latest_digest_date():
    r = client.get(f"{BASE}/tldr")
    r.raise_for_status()
    data = r.json()
    if not data.get("bullets"):
        pytest.skip("No latest digest yet")
    return data.get("date") or (data["generated_at"][:10])


# ============================================================
# Feature 1: OG cards
# ============================================================


def test_og_default_png_dimensions_and_size():
    r = client.get(f"{BASE}/og/default.png")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert len(r.content) < 300 * 1024, f"OG too large: {len(r.content)} bytes"
    # Parse PNG dimensions from IHDR chunk
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
    w = int.from_bytes(r.content[16:20], "big")
    h = int.from_bytes(r.content[20:24], "big")
    assert (w, h) == (1200, 630)


def test_og_story_png(first_story):
    r = client.get(f"{BASE}/og/story/{first_story['id']}.png")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert len(r.content) < 300 * 1024
    w = int.from_bytes(r.content[16:20], "big")
    h = int.from_bytes(r.content[20:24], "big")
    assert (w, h) == (1200, 630)


def test_og_story_second_fetch_is_cached(first_story):
    # first call warms the cache
    client.get(f"{BASE}/og/story/{first_story['id']}.png")
    # second call
    r = client.get(f"{BASE}/og/story/{first_story['id']}.png")
    assert r.status_code == 200
    assert r.headers.get("x-cache") == "HIT"


def test_og_digest_png(latest_digest_date):
    r = client.get(f"{BASE}/og/digest/{latest_digest_date}.png")
    assert r.status_code == 200
    assert len(r.content) < 300 * 1024
    w = int.from_bytes(r.content[16:20], "big")
    h = int.from_bytes(r.content[20:24], "big")
    assert (w, h) == (1200, 630)


def test_og_story_404_for_unknown():
    r = client.get(f"{BASE}/og/story/does-not-exist.png")
    assert r.status_code == 404


def test_og_generation_survives_140_char_headline():
    """Direct call to render_story_card with a 140-char headline."""
    import sys
    sys.path.insert(0, "/app/backend")
    from og import render_story_card
    headline = "OpenAI Resets Weekly Usage Limits for Codex, ChatGPT Work as Active Users Hit 9 Million Milestone Overnight Following Major Rollout Update"
    assert 130 <= len(headline) <= 200
    story = {"id": "test-long", "headline": headline, "category": "Products & Tools",
             "source_count": 27, "first_seen": "2026-07-16T00:00:00+00:00"}
    data = render_story_card(story)
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    w = int.from_bytes(data[16:20], "big")
    h = int.from_bytes(data[20:24], "big")
    assert (w, h) == (1200, 630)
    assert len(data) < 300 * 1024


# ============================================================
# Feature 2: SSR for crawlers
# ============================================================


def _bot(url):
    return client.get(url, headers={"User-Agent": "curl/7.68.0"})


def test_ssr_story_via_frontend(first_story):
    """Fetching a story URL as a crawler must return full HTML with h1, sources, meta, JSON-LD."""
    cat = (first_story.get("category") or "news").lower().replace(" & ", "-").replace(" ", "-")
    url = f"{API}/story/{cat}/{first_story['slug']}"
    r = _bot(url)
    assert r.status_code == 200
    body = r.text
    assert re.search(r"<h1>[^<]+</h1>", body), "missing <h1>"
    assert first_story["headline"] in body
    # OG tags with absolute URL
    m = re.search(r'og:image"\s+content="(https?://[^"]+)"', body)
    assert m, "og:image absolute URL missing"
    assert m.group(1).startswith("http")
    assert "twitter:card" in body
    # JSON-LD NewsArticle
    assert "application/ld+json" in body
    assert '"NewsArticle"' in body
    assert "isBasedOn" in body
    # At least one source anchor
    assert body.count('<a href="http') >= 1


def test_ssr_home_via_frontend():
    r = _bot(f"{API}/")
    assert r.status_code == 200
    body = r.text
    # Home has TL;DR bullets and story links
    assert "<h1>" in body
    # Story anchors present
    assert body.count('href="https://') >= 5 or body.count('/story/') >= 5


def test_spa_served_for_real_browser():
    r = client.get(f"{API}/", headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    })
    assert r.status_code == 200
    # SPA index.html has an empty <div id="root"></div>
    assert '<div id="root"></div>' in r.text


def test_sitemap_valid_and_contains_stories(first_story):
    r = client.get(f"{BASE}/sitemap.xml")
    assert r.status_code == 200
    assert r.text.startswith("<?xml")
    assert "<urlset" in r.text
    assert first_story["slug"] in r.text


def test_robots_txt_disallows_admin():
    r = client.get(f"{BASE}/robots.txt")
    assert r.status_code == 200
    assert "Disallow: /admin" in r.text
    assert "Sitemap:" in r.text


def test_ssr_home_direct_endpoint():
    r = client.get(f"{BASE}/ssr/")
    assert r.status_code == 200
    assert "<!DOCTYPE html>" in r.text
    assert '<h1>' in r.text


def test_ssr_story_direct_endpoint(first_story):
    r = client.get(f"{BASE}/ssr/story/{first_story['slug']}")
    assert r.status_code == 200
    assert first_story["headline"] in r.text
    assert '<script type="application/ld+json">' in r.text


def test_ssr_digest_direct_endpoint(latest_digest_date):
    r = client.get(f"{BASE}/ssr/digest/{latest_digest_date}")
    assert r.status_code == 200
    assert "Today in AI" in r.text
    assert latest_digest_date in r.text or "digest" in r.text.lower()


# ============================================================
# Regression: existing endpoints still work
# ============================================================


def test_feed_still_works():
    r = client.get(f"{BASE}/feed")
    assert r.status_code == 200
    data = r.json()
    assert "stories" in data
    assert "categories" in data


def test_tldr_still_works():
    r = client.get(f"{BASE}/tldr")
    assert r.status_code == 200


def test_story_endpoint_now_returns_roles(first_story):
    r = client.get(f"{BASE}/story/{first_story['slug']}")
    assert r.status_code == 200
    data = r.json()
    assert "sources" in data
    # New feature: sources have role labels
    for s in data["sources"]:
        assert s.get("role") in {"SOURCE", "ENGAGEMENT", "SUPPORT", "ANALYSIS"}


def test_story_endpoint_exposes_keywords_field(first_story):
    r = client.get(f"{BASE}/story/{first_story['slug']}")
    data = r.json()
    assert "keywords" in data  # may be empty list for pre-enrichment stories


def test_admin_password_from_env():
    """ADMIN_PASSWORD must be sourced from environment, not hardcoded."""
    from dotenv import dotenv_values
    env = dotenv_values("/app/backend/.env")
    assert env.get("ADMIN_PASSWORD"), "ADMIN_PASSWORD not defined in /app/backend/.env"
    # Grep the backend source for a hardcoded fallback pw literal
    import subprocess
    result = subprocess.run(
        ["grep", "-rn", "-E",
         r'ADMIN_PASSWORD\s*=\s*["\']pulse-admin',
         "/app/backend/server.py", "/app/backend/pipeline.py"],
        capture_output=True, text=True,
    )
    assert result.stdout.strip() == "", f"Hardcoded ADMIN_PASSWORD found:\n{result.stdout}"
    # Verify server.py sources it via os.environ (no fallback default)
    with open("/app/backend/server.py") as f:
        src = f.read()
    assert "os.environ['ADMIN_PASSWORD']" in src or 'os.environ["ADMIN_PASSWORD"]' in src
