import os
import re
import time
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter, HTTPException, Header, BackgroundTasks
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from pipeline import (db, run_ingestion, generate_tldr, enrich_stories, link_continues_from, ensure_sources,
                      compute_score, now_utc, iso, parse_iso, CATEGORIES)
import og as og_mod
import ssr as ssr_mod

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']
NEWSLETTER_WEBHOOK_URL = os.environ.get('NEWSLETTER_WEBHOOK_URL', '')
SITE_URL = os.environ.get('SITE_URL', 'https://pulse-feed-24.preview.emergentagent.com')

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app):
    await ensure_sources()
    scheduler.add_job(run_ingestion, 'interval', minutes=20, id='ingest')
    scheduler.add_job(generate_tldr, 'interval', minutes=60, id='tldr')
    scheduler.start()
    asyncio.create_task(run_ingestion())
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(lifespan=lifespan)
api = APIRouter(prefix="/api")

_cache = {}


def cached(key, ttl=60):
    entry = _cache.get(key)
    if entry and time.time() - entry[0] < ttl:
        return entry[1]
    return None


def set_cache(key, data):
    _cache[key] = (time.time(), data)


def story_public(s, now=None):
    now = now or now_utc()
    first = parse_iso(s['first_seen'])
    return {
        "id": s['id'], "slug": s['slug'], "headline": s['headline'], "summary": s.get('summary', ''),
        "category": s.get('category', ''), "tags": s.get('tags', []),
        "keywords": s.get('keywords', []),
        "source_count": len(s.get('sources', [])),
        "source_names": list(dict.fromkeys(src['source'] for src in s.get('sources', [])))[:4],
        "first_seen": s['first_seen'], "last_updated": s['last_updated'],
        "is_new": (now - first) < timedelta(hours=6), "is_updated": bool(s.get('updated')),
        "score": compute_score(s, now), "enriched": s.get('enriched', False),
        "continues_from": s.get('continues_from'),
    }


def assign_source_roles(sources):
    """Sort sources by published_at then assign SOURCE / ENGAGEMENT / SUPPORT / ANALYSIS heuristically."""
    if not sources:
        return []
    ordered = sorted(sources, key=lambda x: x.get('published_at', ''))
    first_time = parse_iso(ordered[0]['published_at'])
    first_source = ordered[0]['source']
    seen_sources = set()
    out = []
    for i, s in enumerate(ordered):
        try:
            t = parse_iso(s['published_at'])
        except Exception:
            t = first_time
        delta = (t - first_time).total_seconds() / 3600  # hours
        if i == 0:
            role = "SOURCE"
        elif s['source'] == first_source and delta < 0.5:
            role = "ENGAGEMENT"
        elif s['source'] not in seen_sources and delta <= 6:
            role = "SUPPORT"
        else:
            role = "ANALYSIS"
        seen_sources.add(s['source'])
        out.append({**s, "role": role})
    # Return in chronological order (oldest first) — frontend can decide display order
    return out


@api.get("/feed")
async def get_feed(tag: Optional[str] = None, q: Optional[str] = None):
    key = f"feed:{tag}:{q}"
    if (data := cached(key)) is not None:
        return data
    now = now_utc()
    cutoff = iso(now - timedelta(days=7))
    query = {"first_seen": {"$gte": cutoff}}
    if tag and tag.lower() != 'all':
        query["category"] = {"$regex": f"^{re.escape(tag)}", "$options": "i"}
    if q:
        query["headline"] = {"$regex": re.escape(q), "$options": "i"}
    stories = await db.stories.find(query, {"_id": 0, "tokens": 0}).to_list(1500)
    out = [story_public(s, now) for s in stories]
    out.sort(key=lambda s: (s['first_seen'][:10], s['score']), reverse=True)
    data = {"stories": out, "categories": CATEGORIES}
    set_cache(key, data)
    return data


@api.get("/tldr")
async def get_tldr():
    doc = await db.digests.find_one({"key": "latest"}, {"_id": 0})
    if not doc:
        return {"bullets": [], "generated_at": None}
    return doc


@api.get("/story/{slug}")
async def get_story(slug: str):
    s = await db.stories.find_one({"slug": slug}, {"_id": 0, "tokens": 0})
    if not s:
        s = await db.stories.find_one({"id": slug}, {"_id": 0, "tokens": 0})
    if not s:
        raise HTTPException(404, "Story not found")
    now = now_utc()
    cutoff = iso(now - timedelta(hours=72))
    related = await db.stories.find({"category": s.get('category'), "id": {"$ne": s['id']},
                                     "first_seen": {"$gte": cutoff}}, {"_id": 0, "tokens": 0}).to_list(50)
    related.sort(key=lambda r: compute_score(r, now), reverse=True)
    sources = assign_source_roles(s.get('sources', []))
    return {**story_public(s, now), "sources": sources, "timeline": s.get('timeline', []),
            "headline_history": s.get('headline_history', []),
            "related": [story_public(r, now) for r in related[:5]]}


@api.get("/digest/{date}")
async def get_digest(date: str):
    doc = await db.digests.find_one({"date": date, "key": {"$ne": "latest"}}, {"_id": 0})
    if not doc:
        doc = await db.digests.find_one({"date": date}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "No digest for this date")
    return doc


@api.get("/digests")
async def list_digests():
    docs = await db.digests.find({"key": {"$ne": "latest"}}, {"_id": 0, "date": 1}).sort("date", -1).to_list(60)
    return {"dates": [d['date'] for d in docs]}


class SubscribeIn(BaseModel):
    email: str


@api.post("/newsletter")
async def subscribe(body: SubscribeIn, background: BackgroundTasks):
    email = body.email.strip().lower()
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
        raise HTTPException(400, "Invalid email address")
    existing = await db.subscribers.find_one({"email": email})
    if not existing:
        await db.subscribers.insert_one({"id": str(uuid.uuid4()), "email": email, "created_at": iso(now_utc())})
    if NEWSLETTER_WEBHOOK_URL:
        async def forward():
            try:
                async with httpx.AsyncClient(timeout=10) as c:
                    await c.post(NEWSLETTER_WEBHOOK_URL, json={"email": email})
            except Exception as e:
                logger.warning("Webhook forward failed: %s", e)
        background.add_task(forward)
    return {"ok": True, "message": "Subscribed"}


class BulkIn(BaseModel):
    ids: list


@api.post("/stories/bulk")
async def stories_bulk(body: BulkIn):
    stories = await db.stories.find({"id": {"$in": body.ids[:100]}}, {"_id": 0, "tokens": 0}).to_list(100)
    return {"stories": [story_public(s) for s in stories]}


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


@api.get("/rss.xml")
async def rss():
    cutoff = iso(now_utc() - timedelta(hours=48))
    stories = await db.stories.find({"first_seen": {"$gte": cutoff}, "enriched": True}, {"_id": 0, "tokens": 0}).to_list(500)
    stories.sort(key=lambda s: compute_score(s), reverse=True)
    items = "".join(
        f"<item><title>{esc(s['headline'])}</title><link>{SITE_URL}/story/{s.get('category','news').lower().replace(' ','-').replace('&amp;','and')}/{s['slug']}</link>"
        f"<description>{esc(s.get('summary',''))}</description><pubDate>{parse_iso(s['first_seen']).strftime('%a, %d %b %Y %H:%M:%S GMT')}</pubDate>"
        f"<guid isPermaLink=\"false\">{s['id']}</guid></item>"
        for s in stories[:30])
    xml = (f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>'
           f'<title>PulseAI — Real-Time AI News</title><link>{SITE_URL}</link>'
           f'<description>The most important AI news, deduplicated and ranked.</description>{items}</channel></rss>')
    return Response(content=xml, media_type="application/rss+xml")


@api.get("/sitemap.xml")
async def sitemap():
    stories = await db.stories.find({"enriched": True}, {"_id": 0, "slug": 1, "category": 1, "last_updated": 1}).to_list(3000)
    digests = await db.digests.find({"key": {"$ne": "latest"}}, {"_id": 0, "date": 1}).to_list(100)
    urls = [f"<url><loc>{SITE_URL}/</loc></url>", f"<url><loc>{SITE_URL}/about</loc></url>"]
    urls += [f"<url><loc>{SITE_URL}/story/{(s.get('category') or 'news').lower().replace(' ', '-').replace('&', 'and')}/{s['slug']}</loc><lastmod>{s['last_updated'][:10]}</lastmod></url>" for s in stories]
    urls += [f"<url><loc>{SITE_URL}/digest/{d['date']}</loc></url>" for d in digests]
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{"".join(urls)}</urlset>'
    return Response(content=xml, media_type="application/xml")


# ---------- Admin ----------
def check_admin(pw):
    if pw != ADMIN_PASSWORD:
        raise HTTPException(401, "Invalid admin password")


class AdminVerify(BaseModel):
    password: str


@api.post("/admin/verify")
async def admin_verify(body: AdminVerify):
    check_admin(body.password)
    return {"ok": True}


@api.get("/admin/sources")
async def admin_sources(x_admin_password: str = Header(None, alias="X-Admin-Password")):
    check_admin(x_admin_password)
    sources = await db.sources.find({}, {"_id": 0}).to_list(200)
    return {"sources": sources}


class SourceIn(BaseModel):
    name: str
    url: str
    type: str = "rss"
    ai_only: bool = True


@api.post("/admin/sources")
async def add_source(body: SourceIn, x_admin_password: str = Header(None, alias="X-Admin-Password")):
    check_admin(x_admin_password)
    doc = {**body.model_dump(), "id": str(uuid.uuid4()), "active": True, "last_fetch": None,
           "last_status": "pending", "error_count": 0, "items_pulled": 0}
    await db.sources.insert_one(doc)
    doc.pop('_id', None)
    return doc


class SourcePatch(BaseModel):
    active: Optional[bool] = None
    name: Optional[str] = None
    url: Optional[str] = None


@api.patch("/admin/sources/{source_id}")
async def patch_source(source_id: str, body: SourcePatch, x_admin_password: str = Header(None, alias="X-Admin-Password")):
    check_admin(x_admin_password)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    r = await db.sources.update_one({"id": source_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Source not found")
    return {"ok": True}


@api.delete("/admin/sources/{source_id}")
async def delete_source(source_id: str, x_admin_password: str = Header(None, alias="X-Admin-Password")):
    check_admin(x_admin_password)
    await db.sources.delete_one({"id": source_id})
    return {"ok": True}


@api.post("/admin/run")
async def admin_run(x_admin_password: str = Header(None, alias="X-Admin-Password")):
    check_admin(x_admin_password)
    asyncio.create_task(run_ingestion())
    return {"ok": True, "message": "Ingestion started"}


@api.post("/admin/tldr")
async def admin_tldr(x_admin_password: str = Header(None, alias="X-Admin-Password")):
    check_admin(x_admin_password)
    asyncio.create_task(generate_tldr(force=True))
    return {"ok": True, "message": "TL;DR regeneration started"}


@api.get("/admin/stats")
async def admin_stats(x_admin_password: str = Header(None, alias="X-Admin-Password")):
    check_admin(x_admin_password)
    last = await db.meta.find_one({"key": "last_ingest"}, {"_id": 0})
    return {"stories": await db.stories.count_documents({}),
            "articles": await db.articles.count_documents({}),
            "subscribers": await db.subscribers.count_documents({}),
            "pending_enrichment": await db.stories.count_documents({"enriched": False}),
            "last_ingest": last}


@api.get("/")
async def root():
    return {"message": "PulseAI API", "status": "ok"}


# ---------- OG image endpoints ----------
_OG_HEADERS = {"Cache-Control": "public, max-age=86400, s-maxage=604800"}


@api.get("/og/default.png")
async def og_default():
    data, cached_ = og_mod.cached_or_generate("default-v2.png", og_mod.render_default_card)
    return Response(content=data, media_type="image/png", headers={**_OG_HEADERS, "X-Cache": "HIT" if cached_ else "MISS"})


@api.get("/og/story/{story_id}.png")
async def og_story(story_id: str):
    s = await db.stories.find_one({"id": story_id}, {"_id": 0}) or \
        await db.stories.find_one({"slug": story_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Story not found")
    now = now_utc()
    payload = {**story_public(s, now)}
    name = og_mod.cache_key_story(payload)
    data, cached_ = og_mod.cached_or_generate(name, lambda: og_mod.render_story_card(payload))
    return Response(content=data, media_type="image/png", headers={**_OG_HEADERS, "X-Cache": "HIT" if cached_ else "MISS"})


@api.get("/og/digest/{date}.png")
async def og_digest(date: str):
    doc = await db.digests.find_one({"date": date, "key": {"$ne": "latest"}}, {"_id": 0})
    if not doc:
        doc = await db.digests.find_one({"date": date}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Digest not found")
    import hashlib
    bh = hashlib.md5("|".join(doc.get("bullets", [])).encode()).hexdigest()
    name = og_mod.cache_key_digest(date, bh)
    data, cached_ = og_mod.cached_or_generate(name, lambda: og_mod.render_digest_card(date, doc.get("bullets", [])))
    return Response(content=data, media_type="image/png", headers={**_OG_HEADERS, "X-Cache": "HIT" if cached_ else "MISS"})


# ---------- SSR endpoints ----------
_SSR_CACHE_HOME = 60           # 1 min
_SSR_CACHE_STORY = 600         # 10 min
_SSR_CACHE_DIGEST = 86400      # 1 day (past digests)


@api.get("/ssr/", response_class=Response)
async def ssr_home():
    if (data := cached("ssr:home", ttl=_SSR_CACHE_HOME)) is not None:
        return Response(content=data, media_type="text/html",
                        headers={"Cache-Control": "public, max-age=60"})
    now = now_utc()
    cutoff = iso(now - timedelta(days=7))
    stories = await db.stories.find({"first_seen": {"$gte": cutoff}, "enriched": True}, {"_id": 0, "tokens": 0}).to_list(300)
    stories.sort(key=lambda s: (s['first_seen'][:10], compute_score(s, now)), reverse=True)
    feed = [story_public(s, now) for s in stories]
    tldr = await db.digests.find_one({"key": "latest"}, {"_id": 0}) or {}
    html_out = ssr_mod.render_home_html(tldr, feed)
    set_cache("ssr:home", html_out)
    return Response(content=html_out, media_type="text/html", headers={"Cache-Control": "public, max-age=60"})


@api.get("/ssr/story/{slug}", response_class=Response)
async def ssr_story(slug: str):
    key = f"ssr:story:{slug}"
    if (data := cached(key, ttl=_SSR_CACHE_STORY)) is not None:
        return Response(content=data, media_type="text/html",
                        headers={"Cache-Control": "public, max-age=600"})
    s = await db.stories.find_one({"slug": slug}, {"_id": 0, "tokens": 0}) or \
        await db.stories.find_one({"id": slug}, {"_id": 0, "tokens": 0})
    if not s:
        raise HTTPException(404, "Story not found")
    now = now_utc()
    cutoff = iso(now - timedelta(hours=72))
    related_docs = await db.stories.find({"category": s.get('category'), "id": {"$ne": s['id']},
                                          "first_seen": {"$gte": cutoff}}, {"_id": 0, "tokens": 0}).to_list(50)
    related_docs.sort(key=lambda r: compute_score(r, now), reverse=True)
    related = [story_public(r, now) for r in related_docs[:5]]
    sources = assign_source_roles(s.get('sources', []))
    story = {**story_public(s, now)}
    html_out = ssr_mod.render_story_html(story, sources, related)
    set_cache(key, html_out)
    return Response(content=html_out, media_type="text/html", headers={"Cache-Control": "public, max-age=600"})


@api.get("/ssr/digest/{date}", response_class=Response)
async def ssr_digest(date: str):
    key = f"ssr:digest:{date}"
    if (data := cached(key, ttl=_SSR_CACHE_DIGEST)) is not None:
        return Response(content=data, media_type="text/html",
                        headers={"Cache-Control": "public, max-age=86400"})
    doc = await db.digests.find_one({"date": date, "key": {"$ne": "latest"}}, {"_id": 0})
    if not doc:
        doc = await db.digests.find_one({"date": date}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Digest not found")
    html_out = ssr_mod.render_digest_html(doc)
    set_cache(key, html_out)
    return Response(content=html_out, media_type="text/html", headers={"Cache-Control": "public, max-age=86400"})


@api.get("/robots.txt", response_class=Response)
async def robots_txt():
    txt = f"User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\nDisallow: /api/\n\nSitemap: {SITE_URL}/api/sitemap.xml\n"
    return Response(content=txt, media_type="text/plain")


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
