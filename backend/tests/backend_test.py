"""Backend API tests for PulseAI."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pulse-feed-24.preview.emergentagent.com').rstrip('/')
ADMIN_PW = 'pulse-admin-9F3k'


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin(s):
    s2 = requests.Session()
    s2.headers.update({"Content-Type": "application/json", "X-Admin-Password": ADMIN_PW})
    return s2


# --------- Feed ---------
class TestFeed:
    def test_feed_basic(self, s):
        r = s.get(f"{BASE_URL}/api/feed", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "stories" in d and "categories" in d
        assert isinstance(d["stories"], list)
        assert len(d["stories"]) > 0
        st = d["stories"][0]
        for k in ["headline", "category", "source_count", "is_new", "score", "slug"]:
            assert k in st, f"missing {k}"

    def test_feed_tag_filter(self, s):
        r = s.get(f"{BASE_URL}/api/feed", params={"tag": "Security"}, timeout=30)
        assert r.status_code == 200
        stories = r.json()["stories"]
        for st in stories:
            assert st["category"].lower().startswith("security"), st["category"]

    def test_feed_search(self, s):
        r = s.get(f"{BASE_URL}/api/feed", params={"q": "AI"}, timeout=30)
        assert r.status_code == 200
        for st in r.json()["stories"]:
            assert "ai" in st["headline"].lower()


# --------- TLDR ---------
class TestTldr:
    def test_tldr(self, s):
        r = s.get(f"{BASE_URL}/api/tldr", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "bullets" in d and "generated_at" in d
        if d["bullets"]:
            assert len(d["bullets"]) >= 1


# --------- Story ---------
class TestStory:
    def test_story_ok_and_404(self, s):
        feed = s.get(f"{BASE_URL}/api/feed", timeout=30).json()
        slug = feed["stories"][0]["slug"]
        r = s.get(f"{BASE_URL}/api/story/{slug}", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["slug"] == slug
        assert "sources" in d and isinstance(d["sources"], list)
        assert "related" in d
        if d["sources"]:
            assert "url" in d["sources"][0]

        r2 = s.get(f"{BASE_URL}/api/story/definitely-does-not-exist-xyz", timeout=30)
        assert r2.status_code == 404


# --------- Newsletter ---------
class TestNewsletter:
    def test_valid(self, s):
        r = s.post(f"{BASE_URL}/api/newsletter", json={"email": "TEST_pulse@example.com"}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_invalid(self, s):
        r = s.post(f"{BASE_URL}/api/newsletter", json={"email": "not-an-email"}, timeout=30)
        assert r.status_code == 400


# --------- Feeds XML ---------
class TestXml:
    def test_rss(self, s):
        r = s.get(f"{BASE_URL}/api/rss.xml", timeout=30)
        assert r.status_code == 200
        assert "<rss" in r.text and "</rss>" in r.text

    def test_sitemap(self, s):
        r = s.get(f"{BASE_URL}/api/sitemap.xml", timeout=30)
        assert r.status_code == 200
        assert "<urlset" in r.text


# --------- Admin ---------
class TestAdmin:
    def test_verify_ok(self, s):
        r = s.post(f"{BASE_URL}/api/admin/verify", json={"password": ADMIN_PW}, timeout=30)
        assert r.status_code == 200

    def test_verify_bad(self, s):
        r = s.post(f"{BASE_URL}/api/admin/verify", json={"password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_sources_requires_header(self, s):
        r = s.get(f"{BASE_URL}/api/admin/sources", timeout=30)
        assert r.status_code == 401

    def test_sources_list(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/sources", timeout=30)
        assert r.status_code == 200
        assert "sources" in r.json()

    def test_source_crud(self, admin):
        payload = {"name": "TEST_Source", "url": "https://example.com/rss", "type": "rss", "ai_only": True}
        r = admin.post(f"{BASE_URL}/api/admin/sources", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        # patch
        r2 = admin.patch(f"{BASE_URL}/api/admin/sources/{sid}", json={"active": False}, timeout=30)
        assert r2.status_code == 200
        # verify
        listing = admin.get(f"{BASE_URL}/api/admin/sources", timeout=30).json()["sources"]
        found = [x for x in listing if x["id"] == sid]
        assert found and found[0]["active"] is False
        # delete
        r3 = admin.delete(f"{BASE_URL}/api/admin/sources/{sid}", timeout=30)
        assert r3.status_code == 200

    def test_stats(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/stats", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["stories", "articles", "subscribers", "pending_enrichment"]:
            assert k in d


# --------- Digest ---------
class TestDigest:
    def test_digest_today_or_recent(self, s):
        # Try today then a few recent dates
        from datetime import datetime, timezone, timedelta
        found = False
        for i in range(0, 7):
            d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
            r = s.get(f"{BASE_URL}/api/digest/{d}", timeout=30)
            if r.status_code == 200:
                data = r.json()
                assert "bullets" in data or "top_stories" in data
                found = True
                break
        # If no digest exists for last 7 days, still verify 404 works
        if not found:
            r = s.get(f"{BASE_URL}/api/digest/1999-01-01", timeout=30)
            assert r.status_code == 404
