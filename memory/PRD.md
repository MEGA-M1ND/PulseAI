# PulseAI — Product Requirements Document

## Original Problem Statement
Build a production-quality, real-time AI news aggregator (like huggingnews.com but better). Auto-ingests AI news from dozens of sources every 20 minutes, clusters duplicate coverage into single stories, LLM-rewrites headlines neutrally, ranks by importance, day-grouped feed with 24h TL;DR digest. Goal: traffic and repeat visits — instant load, mobile+desktop polish, shareable, SEO-friendly.

## User Choices
- LLM: Emergent Universal Key with OpenAI gpt-5.4-mini
- Admin password: generated (`pulse-admin-9F3k`, in /app/memory/test_credentials.md)
- Newsletter webhook: not yet — emails stored in MongoDB, NEWSLETTER_WEBHOOK_URL env var ready for Beehiiv
- Scope: Phase 1 + quick Phase 2 wins (search, filters, bookmarks, admin dashboard); magic-link auth deferred

## Architecture
- FastAPI backend (port 8001, /api prefix) + React/Tailwind frontend + MongoDB
- `pipeline.py`: APScheduler jobs — ingestion every 20 min, TL;DR every 60 min
  - Fetch: 13 seeded sources (RSS + HN Algolia), fault-tolerant per-source, health tracked
  - Filter: keyword AI relevance (ai_only sources bypass)
  - Cluster: token Jaccard similarity (threshold 0.45) over 72h window
  - Enrich: gpt-5.4-mini batched (8/call) — headline rewrite, <60-word summary, 1-of-8 category, tags
  - Score: sources×10 + 6h-velocity×15 − age_hours×1.5 (computed at read)
  - TL;DR: 5-bullet digest, archived per date in `digests` collection
- 60s in-memory cache on /api/feed
- Design: dark-default editorial (Playfair Display + Inter, cobalt accent, noise texture)

## Implemented (2026-07-16) — MVP complete, tested 100% backend + frontend
- Ingestion pipeline end-to-end (130 stories seeded on first run)
- Home feed: TL;DR hero, day grouping, ranked story cards (rank, category chip, source count, NEW/UPDATED badges), sticky filter chips with ?tag= URL persistence, search with "/" shortcut, j/k/Enter keyboard nav
- Story pages /story/{category}/{slug}: H1, summary, outbound source list, timeline, related stories, share (X/LinkedIn/copy), JSON-LD NewsArticle
- /saved (localStorage bookmarks), /digest/:date, /about
- /admin: password-gated source CRUD, per-source health, stats, manual ingest/TL;DR triggers
- Newsletter capture (footer + inline after first day-group), stored in MongoDB, webhook-ready
- /api/rss.xml, /api/sitemap.xml, dark/light toggle persisted, skeleton/empty states

## Backlog (prioritized)
- P1: OG image auto-generation per story (branded share cards)
- P1: server-rendered/pre-rendered HTML for crawlers (currently SPA with meta injection)
- P1: arXiv API source with traction cross-referencing (Research)
- P2: manual merge/split of story clusters in admin
- P2: LLM relevance classifier for ambiguous items; embedding-based clustering upgrade
- P2: cache LRU cap + cache invalidation after ingestion
- P3: magic-link auth + full archive beyond 7 days; "For You" personalized ranking; admin rate limiting

## Next Tasks
1. Connect Beehiiv webhook (set NEWSLETTER_WEBHOOK_URL in backend/.env)
2. OG image generation
3. arXiv source
