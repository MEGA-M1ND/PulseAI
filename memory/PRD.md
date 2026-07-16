# PulseAI — Product Requirements Document

## Original Problem Statement
Build a production-quality, real-time AI news aggregator (like huggingnews.com but better). Auto-ingests AI news from dozens of sources every 20 minutes, clusters duplicate coverage into single stories, LLM-rewrites headlines neutrally, ranks by importance, day-grouped feed with 24h TL;DR digest. Goal: traffic and repeat visits — instant load, mobile+desktop polish, shareable, SEO-friendly.

## User Choices
- LLM: Emergent Universal Key with OpenAI gpt-5.4-mini
- Admin password: env-only (`ADMIN_PASSWORD` in /app/backend/.env, current value in /app/memory/test_credentials.md)
- Newsletter webhook: emails stored in MongoDB, NEWSLETTER_WEBHOOK_URL env var ready for Beehiiv
- UI model: **inline-expandable rows** (huggingnews-style); /story/… remains a shareable SEO permalink
- Key-sources are RSS/HN items (no Twitter/X ingestion yet — role labels SOURCE/ENGAGEMENT/SUPPORT/ANALYSIS assigned heuristically)

## Architecture
- FastAPI backend (port 8001, /api prefix) + React/Tailwind frontend + MongoDB
- `pipeline.py`: APScheduler jobs — ingestion every 20 min, TL;DR every 60 min
  - Enrich (batched, 8/call): headline rewrite, ≤60-word summary, category, tags, **keywords (up to 6 specific noun phrases)**
  - **`link_continues_from`** LLM pass links a fresh story to an older cluster in the same category (12h–10d earlier) when it's a direct continuation
- `og.py`: Pillow OG image generator, filesystem cache at `/app/backend/cache/og/`, bundled fonts in `/app/backend/assets/fonts/`
- `ssr.py`: server-rendered HTML for `/`, `/story/<slug>`, `/digest/<date>`
- Frontend `craco.config.js` `setupMiddlewares`: bot-UA detection proxies to `/api/ssr/*`, real browsers get the SPA (allows one-page SSR without rewriting the app)

## Implemented — MVP + OG cards + SSR (2026-07-16)
### MVP (baseline)
- Ingestion pipeline, home feed, TL;DR hero, filters + search, keyboard nav, admin dashboard, RSS/sitemap XML, bookmarks, dark/light toggle.

### Feature 1 — Branded OG share cards
- `GET /api/og/{default,story/{id},digest/{date}}.png` → 1200×630 PNG (<300 KB), filesystem-cached, `X-Cache: HIT` on repeat fetches, regenerates only when headline/bullets change (content-hashed filenames)
- Three card types: story (category chip + auto-sized Playfair headline + N sources · date + domain), digest ("Today in AI — {date}" + 5 bullets), default (wordmark + tagline)
- Bundled fonts: Inter (variable) + Playfair Display (variable) — no system-font dependency
- Meta tags wired on both SSR HTML and SPA client-side (`Story.jsx` `setMeta`): og:title, og:description, og:image (absolute), og:url, og:image:width/height, twitter:card=summary_large_image, twitter:title/description/image, canonical link
- `TldrHero` gained a "Share digest" button that copies `/digest/<YYYY-MM-DD>`

### Feature 2 — SSR for crawlers
- Backend `/api/ssr/`, `/api/ssr/story/{slug}`, `/api/ssr/digest/{date}` return fully-populated HTML with h1, summary, JSON-LD NewsArticle (headline/datePublished/dateModified/isBasedOn/citation/publisher), source anchors, TOPICS/TAGS/KEYWORDS blocks, "Continues from" back-reference
- Frontend `setupMiddlewares` inspects UA against `bot|crawl|spider|slurp|whatsapp|slack|discord|facebookexternalhit|linkedin|twitter|telegram|preview|curl|wget|python-requests|httpie|libwww|node-fetch|axios|http-client|pagespeed` and streams the SSR body
- In-memory cache: 60s home, 10min story, 24h digest
- `/api/robots.txt` (Disallow /admin, /api/) and updated `/api/sitemap.xml` include every enriched story + digest
- All existing SPA behaviour preserved for real browsers

### Feature 3 — Inline-expandable rows UI
- `StoryRow.jsx`: click header → expands inline with TOPICS chips (AI/Tech), TAGS chips, KEYWORDS chips (muted), summary paragraphs, "Continues from" pointer, KEY SOURCES table (role label + source name + time + article title/url), "See all N sources" link, share/bookmark/permalink actions
- Only one row expanded at a time; keyboard `j`/`k` navigate, `Enter` toggles expand, `o` opens permalink
- `/story/<cat>/<slug>` permalink page shows the same expanded content plus related-stories block

### Small polish
- ADMIN_PASSWORD env-only (no hardcoded fallback), verified by pytest
- `assign_source_roles` heuristic: first source = SOURCE, same-source within 30min = ENGAGEMENT, new source within 6h = SUPPORT, later = ANALYSIS
- Playfair Display + Inter variable fonts served locally from `/app/backend/assets/fonts/`

## Tests
- `/app/backend/tests/test_og_and_ssr.py` — 19 pytest tests, all passing
- Full backend + frontend testing agent pass (iteration_2.json), 100/100

## Backlog (prioritized)
- **P1**: X/Twitter source integration (paid API tier) — would replace heuristic role labels with real tweet quotes as shown in original reference images
- P1: Manual merge/split of story clusters in admin
- P2: arXiv source with traction cross-referencing (Research category)
- P2: LLM relevance classifier for ambiguous items; embedding-based clustering upgrade
- P2: Cache LRU cap + cache invalidation post-ingestion
- P3: Magic-link auth + full archive beyond 7 days
- P3: "For You" personalized ranking based on bookmarks
- P3: Beehiiv webhook wiring
