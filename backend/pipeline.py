import os
import re
import json
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

import httpx
import feedparser
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv(Path(__file__).parent / '.env')
client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
logger = logging.getLogger("pipeline")

LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

CATEGORIES = ["AI Models", "Chips & Compute", "Business & Funding", "Policy & Regulation",
              "Security", "Research", "Products & Tools", "Markets"]

AI_KEYWORDS = [
    "ai", "a.i.", "artificial intelligence", "llm", "gpt", "claude", "gemini", "openai",
    "anthropic", "deepmind", "machine learning", "deep learning", "neural", "transformer",
    "agent", "agentic", "gpu", "chip", "nvidia", "semiconductor", "data center", "datacenter",
    "inference", "chatbot", "copilot", "hugging face", "mistral", "xai", "grok", "llama",
    "diffusion", "robotics", "autonomous", "tpu", "foundation model", "generative", "deepseek",
    "qwen", "perplexity", "midjourney", "stability ai", "cerebras", "groq", "superintelligence"
]

STOPWORDS = {"the", "a", "an", "of", "to", "in", "on", "for", "and", "with", "as", "at", "by",
             "is", "are", "its", "from", "after", "over", "new", "says", "how", "why", "what",
             "will", "be", "has", "have", "it", "that", "this", "up", "out", "now", "into"}

SEED_SOURCES = [
    {"name": "TechCrunch AI", "url": "https://techcrunch.com/category/artificial-intelligence/feed/", "type": "rss", "ai_only": True},
    {"name": "VentureBeat AI", "url": "https://venturebeat.com/category/ai/feed/", "type": "rss", "ai_only": True},
    {"name": "The Verge AI", "url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "type": "rss", "ai_only": True},
    {"name": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/index", "type": "rss", "ai_only": False},
    {"name": "Wired AI", "url": "https://www.wired.com/feed/tag/ai/latest/rss", "type": "rss", "ai_only": True},
    {"name": "MIT Technology Review", "url": "https://www.technologyreview.com/feed/", "type": "rss", "ai_only": False},
    {"name": "OpenAI Blog", "url": "https://openai.com/news/rss.xml", "type": "rss", "ai_only": True},
    {"name": "Hugging Face Blog", "url": "https://huggingface.co/blog/feed.xml", "type": "rss", "ai_only": True},
    {"name": "Google DeepMind", "url": "https://deepmind.google/blog/rss.xml", "type": "rss", "ai_only": True},
    {"name": "NVIDIA Blog", "url": "https://blogs.nvidia.com/feed/", "type": "rss", "ai_only": True},
    {"name": "Simon Willison", "url": "https://simonwillison.net/atom/everything/", "type": "rss", "ai_only": True},
    {"name": "Google News AI", "url": "https://news.google.com/rss/search?q=artificial+intelligence+OR+OpenAI+OR+Anthropic+OR+%22AI+model%22&hl=en-US&gl=US&ceid=US:en", "type": "rss", "ai_only": True},
    {"name": "Hacker News", "url": "https://hn.algolia.com/api/v1/search_by_date", "type": "hn", "ai_only": False},
]

_ingest_lock = asyncio.Lock()


def now_utc():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def parse_iso(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


def is_ai_relevant(text):
    t = " " + re.sub(r'[^a-z0-9. ]', ' ', text.lower()) + " "
    return any(f" {kw} " in t or kw in text.lower() and len(kw) > 4 for kw in AI_KEYWORDS)


def tokenize(text):
    words = re.findall(r'[a-z0-9]+', text.lower())
    return set(w for w in words if w not in STOPWORDS and len(w) > 2)


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def slugify(text, sid):
    s = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')[:70].rstrip('-')
    return f"{s}-{sid[:6]}"


def compute_score(story, now=None):
    now = now or now_utc()
    sources = story.get('sources', [])
    n = len(sources)
    cutoff = now - timedelta(hours=6)
    velocity = sum(1 for s in sources if parse_iso(s['fetched_at']) >= cutoff)
    age_h = max(0, (now - parse_iso(story['first_seen'])).total_seconds() / 3600)
    return round(n * 10 + velocity * 15 - age_h * 1.5, 2)


async def ensure_sources():
    if await db.sources.count_documents({}) == 0:
        docs = [{**s, "id": str(uuid.uuid4()), "active": True, "last_fetch": None,
                 "last_status": "pending", "error_count": 0, "items_pulled": 0} for s in SEED_SOURCES]
        await db.sources.insert_many(docs)
        logger.info("Seeded %d sources", len(docs))


def parse_entry_time(entry):
    for key in ('published_parsed', 'updated_parsed'):
        t = entry.get(key)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    return now_utc()


async def fetch_rss(source, http):
    resp = await http.get(source['url'], follow_redirects=True, headers={"User-Agent": "PulseAI/1.0 news aggregator"})
    resp.raise_for_status()
    parsed = feedparser.parse(resp.text)
    items = []
    for e in parsed.entries[:40]:
        title = (e.get('title') or '').strip()
        link = e.get('link') or ''
        if not title or not link:
            continue
        desc = re.sub(r'<[^>]+>', '', e.get('summary', '') or '')[:400].strip()
        items.append({"title": title, "url": link, "excerpt": desc, "published_at": iso(parse_entry_time(e))})
    return items


async def fetch_hn(source, http):
    items = []
    for q in ["AI", "LLM", "OpenAI"]:
        resp = await http.get(source['url'], params={"query": q, "tags": "story", "numericFilters": "points>40", "hitsPerPage": 15})
        resp.raise_for_status()
        for h in resp.json().get('hits', []):
            title, url = h.get('title'), h.get('url') or f"https://news.ycombinator.com/item?id={h.get('objectID')}"
            if not title:
                continue
            ts = h.get('created_at', iso(now_utc()))
            items.append({"title": title, "url": url, "excerpt": f"{h.get('points', 0)} points on Hacker News", "published_at": ts})
    return items


async def fetch_source(source, http):
    try:
        items = await fetch_hn(source, http) if source['type'] == 'hn' else await fetch_rss(source, http)
        await db.sources.update_one({"id": source['id']}, {"$set": {"last_fetch": iso(now_utc()), "last_status": "ok", "last_error": None},
                                                           "$inc": {"items_pulled": len(items)}})
        return source, items
    except Exception as e:
        logger.warning("Source %s failed: %s", source['name'], e)
        await db.sources.update_one({"id": source['id']}, {"$set": {"last_fetch": iso(now_utc()), "last_status": "error", "last_error": str(e)[:300]},
                                                           "$inc": {"error_count": 1}})
        return source, []


async def cluster_item(item, source_name, recent_stories, now):
    tokens = tokenize(item['title'])
    best, best_sim = None, 0.0
    for story in recent_stories:
        sim = jaccard(tokens, set(story.get('tokens', [])))
        if sim > best_sim:
            best, best_sim = story, sim
    entry = {"source": source_name, "title": item['title'], "url": item['url'],
             "published_at": item['published_at'], "fetched_at": iso(now)}
    if best is not None and best_sim >= 0.45:
        update = {"$push": {"sources": entry}, "$set": {"last_updated": iso(now)},
                  "$addToSet": {"tokens": {"$each": list(tokens)}}}
        if (now - parse_iso(best['first_seen'])) > timedelta(hours=6) and best.get('enriched'):
            update["$set"]["updated"] = True
            update["$push"] = {"sources": entry, "timeline": {"time": iso(now), "note": f"New coverage from {source_name}"}}
        await db.stories.update_one({"id": best['id']}, update)
        best.setdefault('sources', []).append(entry)
        best['tokens'] = list(set(best.get('tokens', [])) | tokens)
        return best['id']
    sid = str(uuid.uuid4())
    story = {"id": sid, "slug": slugify(item['title'], sid), "headline": item['title'],
             "summary": "", "category": "", "tags": [], "enriched": False, "updated": False,
             "first_seen": iso(now), "last_updated": iso(now), "sources": [entry],
             "tokens": list(tokens), "headline_history": [], "timeline": [{"time": iso(now), "note": f"First reported by {source_name}"}]}
    await db.stories.insert_one(story)
    recent_stories.append(story)
    return sid


def extract_json(text):
    m = re.search(r'\[.*\]', text, re.DOTALL)
    return json.loads(m.group(0)) if m else json.loads(text)


async def llm_call(system, prompt):
    chat = LlmChat(api_key=LLM_KEY, session_id=f"pipe-{uuid.uuid4()}", system_message=system).with_model("openai", "gpt-5.4-mini")
    resp = await chat.send_message(UserMessage(text=prompt))
    return str(resp)


EDITOR_SYS = ("You are a senior wire-service editor for an AI industry news aggregator. "
              "You write factual, specific, neutral headlines with concrete numbers when available. No clickbait, no editorializing.")


async def enrich_stories(limit=200):
    pending = await db.stories.find({"enriched": False}, {"_id": 0}).sort("first_seen", -1).to_list(limit)
    for i in range(0, len(pending), 8):
        batch = pending[i:i + 8]
        payload = [{"id": s['id'], "titles": [src['title'] for src in s['sources'][:5]],
                    "excerpt": (s['sources'][0].get('title', '') + '. ')} for s in batch]
        prompt = (
            f"Here are news story clusters, each with source headlines:\n{json.dumps(payload)}\n\n"
            f"For EACH story return: id (unchanged), headline (rewritten: factual, specific, neutral, include concrete numbers if present, max 110 chars), "
            f"summary (2-3 neutral sentences, STRICTLY under 60 words, a teaser not a replacement), "
            f"category (exactly one of: {', '.join(CATEGORIES)}), tags (up to 3 short secondary tags). "
            f"Respond with ONLY a JSON array of objects with keys id, headline, summary, category, tags.")
        try:
            results = extract_json(await llm_call(EDITOR_SYS, prompt))
        except Exception as e:
            logger.error("Enrichment batch failed: %s", e)
            continue
        for r in results:
            cat = r.get('category') if r.get('category') in CATEGORIES else "Products & Tools"
            story = next((s for s in batch if s['id'] == r.get('id')), None)
            if not story:
                continue
            headline = (r.get('headline') or story['headline'])[:160]
            await db.stories.update_one({"id": story['id']}, {"$set": {
                "headline": headline, "summary": r.get('summary', '')[:400], "category": cat,
                "tags": (r.get('tags') or [])[:3], "enriched": True, "slug": slugify(headline, story['id'])}})
        logger.info("Enriched %d stories", len(results))


async def generate_tldr(force=False):
    latest = await db.digests.find_one({"key": "latest"}, {"_id": 0})
    if latest and not force:
        age = now_utc() - parse_iso(latest['generated_at'])
        if age < timedelta(minutes=55):
            return
    cutoff = iso(now_utc() - timedelta(hours=24))
    stories = await db.stories.find({"first_seen": {"$gte": cutoff}, "enriched": True}, {"_id": 0}).to_list(300)
    if not stories:
        return
    stories.sort(key=lambda s: compute_score(s), reverse=True)
    top = stories[:12]
    prompt = (f"Top AI news stories from the last 24 hours:\n"
              + "\n".join(f"- {s['headline']} ({len(s['sources'])} sources): {s['summary']}" for s in top)
              + "\n\nWrite a 5-bullet plain-English digest of the most important developments. Each bullet is one crisp sentence, "
                "specific and factual, no fluff. Respond with ONLY a JSON array of exactly 5 strings.")
    try:
        bullets = extract_json(await llm_call(EDITOR_SYS, prompt))[:5]
    except Exception as e:
        logger.error("TLDR failed: %s", e)
        return
    date_key = now_utc().strftime('%Y-%m-%d')
    top_snapshot = [{"slug": s['slug'], "headline": s['headline'], "category": s['category'],
                     "source_count": len(s['sources'])} for s in top[:10]]
    doc = {"date": date_key, "bullets": bullets, "generated_at": iso(now_utc()), "top_stories": top_snapshot}
    await db.digests.update_one({"key": "latest"}, {"$set": {**doc, "key": "latest"}}, upsert=True)
    await db.digests.update_one({"date": date_key, "key": {"$ne": "latest"}}, {"$set": doc}, upsert=True)
    logger.info("TL;DR generated with %d bullets", len(bullets))


async def run_ingestion():
    if _ingest_lock.locked():
        logger.info("Ingestion already running, skipping")
        return
    async with _ingest_lock:
        await ensure_sources()
        sources = await db.sources.find({"active": True}, {"_id": 0}).to_list(100)
        now = now_utc()
        async with httpx.AsyncClient(timeout=20) as http:
            results = await asyncio.gather(*[fetch_source(s, http) for s in sources])
        cutoff = iso(now - timedelta(hours=72))
        recent_stories = await db.stories.find({"first_seen": {"$gte": cutoff}}, {"_id": 0}).to_list(2000)
        new_items = 0
        for source, items in results:
            for item in items:
                if await db.articles.find_one({"url": item['url']}):
                    continue
                if parse_iso(item['published_at']) < now - timedelta(hours=72):
                    continue
                if not source['ai_only'] and not is_ai_relevant(item['title'] + ' ' + item.get('excerpt', '')):
                    continue
                story_id = await cluster_item(item, source['name'], recent_stories, now)
                await db.articles.insert_one({"id": str(uuid.uuid4()), "url": item['url'], "title": item['title'],
                                              "source_name": source['name'], "published_at": item['published_at'],
                                              "excerpt": item.get('excerpt', ''), "story_id": story_id, "fetched_at": iso(now)})
                new_items += 1
        await db.meta.update_one({"key": "last_ingest"}, {"$set": {"key": "last_ingest", "time": iso(now), "new_items": new_items}}, upsert=True)
        logger.info("Ingestion done: %d new items", new_items)
        await enrich_stories()
        await generate_tldr()
