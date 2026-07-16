"""Server-side rendered HTML for crawler-critical routes."""
import html
import json
import os
import re
from datetime import datetime, timezone, timedelta

SITE_URL = os.environ.get("SITE_URL", "").rstrip("/")


def esc(s):
    return html.escape(str(s or ""), quote=True)


def _absurl(path):
    return f"{SITE_URL}{path}"


def _story_path(s):
    cat = (s.get("category") or "news").lower().replace(" & ", "-").replace(" ", "-")
    return f"/story/{cat}/{s['slug']}"


def _base_html(*, title, description, canonical, og_image, og_type="article", jsonld=None, body_html="", extra_head=""):
    ld = f'<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>' if jsonld else ""
    return f"""<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0A0A0A" />
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}" />
<link rel="canonical" href="{esc(canonical)}" />
<meta property="og:title" content="{esc(title)}" />
<meta property="og:description" content="{esc(description)}" />
<meta property="og:type" content="{og_type}" />
<meta property="og:url" content="{esc(canonical)}" />
<meta property="og:image" content="{esc(og_image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:site_name" content="PulseAI" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{esc(title)}" />
<meta name="twitter:description" content="{esc(description)}" />
<meta name="twitter:image" content="{esc(og_image)}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Inter:wght@300..700&display=swap" rel="stylesheet" />
<style>
:root{{color-scheme:dark;background:#0A0A0A;color:#E5E7EB}}
body{{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0A0A0A;color:#E5E7EB}}
.wrap{{max-width:960px;margin:0 auto;padding:32px 24px}}
a{{color:#FBBF24;text-decoration:none}}
a:hover{{text-decoration:underline}}
h1{{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:44px;line-height:1.1;margin:16px 0;color:#F5F5F5}}
h2{{font-family:'Playfair Display',Georgia,serif;font-weight:800;font-size:28px;line-height:1.2;color:#F5F5F5;margin:24px 0 8px}}
.kicker{{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#FBBF24;font-weight:600}}
.meta{{color:#9CA3AF;font-size:14px}}
.chip{{display:inline-block;padding:2px 10px;border-radius:999px;border:1px solid #27272A;color:#D4D4D8;font-size:12px;margin-right:6px}}
.summary{{font-size:18px;line-height:1.6;color:#D4D4D8;margin:16px 0}}
.src{{padding:12px 0;border-top:1px solid #1F2937}}
.src .role{{color:#FBBF24;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;width:110px;display:inline-block}}
.src .who{{color:#F5F5F5;font-weight:500}}
.src .when{{color:#6B7280;font-size:12px;margin-left:8px}}
.src .quote{{color:#D4D4D8;margin-top:4px;padding-left:118px}}
.bullets li{{margin:8px 0;color:#D4D4D8}}
nav{{padding:12px 24px;border-bottom:1px solid #1F2937;font-size:14px}}
nav a{{color:#E5E7EB;margin-right:16px}}
.brand{{color:#FBBF24;font-weight:700}}
.day{{margin-top:32px;padding-top:16px;border-top:1px solid #1F2937}}
.day h2{{margin:0 0 12px}}
.row{{padding:14px 0;border-top:1px solid #1F2937}}
.row a{{color:#F5F5F5;font-weight:600;font-size:17px;line-height:1.35}}
.row a:hover{{color:#FBBF24}}
</style>
{extra_head}
{ld}
</head>
<body>
<nav>
<a href="/" class="brand">● PulseAI</a>
<a href="/about">About</a>
<a href="/api/rss.xml">RSS</a>
</nav>
<main class="wrap">
{body_html}
</main>
</body>
</html>"""


def render_story_html(story: dict, sources: list, related: list) -> str:
    headline = story.get("headline", "")
    summary = story.get("summary", "")
    category = story.get("category", "News")
    tags = story.get("tags") or []
    keywords = story.get("keywords") or []
    first_seen = story.get("first_seen") or ""
    last_updated = story.get("last_updated") or first_seen
    continues_from = story.get("continues_from")

    canonical = _absurl(_story_path(story))
    og_image = _absurl(f"/api/og/story/{story['id']}.png")

    src_html_parts = []
    for s in sources[:40]:
        role = esc(s.get("role", "SOURCE"))
        who = esc(s.get("source", ""))
        try:
            when = datetime.fromisoformat(s["published_at"].replace("Z", "+00:00")).strftime("%b %-d %-I:%M%p").lower()
        except Exception:
            when = ""
        title = esc(s.get("title", ""))
        url = esc(s.get("url", "#"))
        src_html_parts.append(
            f'<div class="src"><span class="role">{role}</span>'
            f'<span class="who">{who}</span><span class="when">{esc(when)}</span>'
            f'<div class="quote">— <a href="{url}" rel="nofollow noopener" target="_blank">{title}</a></div></div>'
        )

    tags_html = " ".join(f'<span class="chip">{esc(t)}</span>' for t in tags)
    keywords_html = " ".join(f'<span class="chip">{esc(k)}</span>' for k in keywords) if keywords else ""

    continues_html = ""
    if continues_from:
        cf_url = _absurl(_story_path(continues_from))
        continues_html = (f'<div style="margin:16px 0;padding:16px;border:1px solid #27272A;border-radius:8px">'
                          f'<div class="kicker">Continues from</div>'
                          f'<div style="margin-top:6px"><a href="{esc(cf_url)}">{esc(continues_from.get("headline",""))}</a></div>'
                          f'<div class="meta">{continues_from.get("source_count",0)} sources</div></div>')

    related_html = ""
    if related:
        related_html = '<h2>Related</h2>' + "".join(
            f'<div class="row"><a href="{esc(_absurl(_story_path(r)))}">{esc(r.get("headline",""))}</a>'
            f'<div class="meta">{esc(r.get("category",""))} · {r.get("source_count",0)} sources</div></div>'
            for r in related[:5])

    body = f"""
<div class="kicker">{esc(category)}</div>
<h1>{esc(headline)}</h1>
<div class="meta">{len(sources)} sources · Updated {esc(last_updated[:10])}</div>
<div style="margin-top:8px">{tags_html}</div>
{f'<div style="margin-top:6px"><span class="kicker">Keywords</span> {keywords_html}</div>' if keywords_html else ''}
<div class="summary">{esc(summary)}</div>
{continues_html}
<h2>Key sources</h2>
{''.join(src_html_parts) or '<div class="meta">No sources.</div>'}
{related_html}
"""

    jsonld = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": headline,
        "description": summary,
        "datePublished": first_seen,
        "dateModified": last_updated,
        "url": canonical,
        "image": og_image,
        "articleSection": category,
        "keywords": ", ".join(tags + keywords),
        "isBasedOn": [s.get("url") for s in sources[:20] if s.get("url")],
        "citation": [{"@type": "CreativeWork", "url": s.get("url"), "name": s.get("source")}
                     for s in sources[:20] if s.get("url")],
        "publisher": {"@type": "Organization", "name": "PulseAI", "url": SITE_URL},
    }

    return _base_html(
        title=f"{headline} — PulseAI",
        description=summary or f"{len(sources)} sources covering {headline}",
        canonical=canonical,
        og_image=og_image,
        og_type="article",
        jsonld=jsonld,
        body_html=body,
    )


def render_home_html(tldr: dict, feed: list) -> str:
    canonical = _absurl("/")
    og_image = _absurl("/api/og/default.png")

    # TL;DR bullets
    tldr_html = ""
    bullets = tldr.get("bullets") or []
    if bullets:
        gen = tldr.get("generated_at", "")[:10]
        tldr_html = (
            '<div style="border:1px solid #FBBF24;border-radius:12px;padding:20px;margin-bottom:24px">'
            f'<div class="kicker">Today in AI · {esc(gen)}</div>'
            f'<ul class="bullets">{"".join(f"<li>{esc(b)}</li>" for b in bullets)}</ul>'
            '</div>'
        )

    # Day grouping
    grouped = {}
    for s in feed:
        d = (s.get("first_seen") or "")[:10]
        grouped.setdefault(d, []).append(s)
    days_html = []
    for day in sorted(grouped.keys(), reverse=True)[:7]:
        stories = grouped[day]
        try:
            day_label = datetime.fromisoformat(day).strftime("%A, %b %-d, %Y")
        except Exception:
            day_label = day
        rows = "".join(
            f'<div class="row"><a href="{esc(_absurl(_story_path(s)))}">{esc(s.get("headline",""))}</a>'
            f'<div class="meta">{esc(s.get("category",""))} · {s.get("source_count",0)} sources</div></div>'
            for s in stories
        )
        days_html.append(f'<section class="day"><h2>{esc(day_label)} <span class="meta">· {len(stories)} stories</span></h2>{rows}</section>')

    body = f"""
<h1>PulseAI — Real-Time AI News</h1>
<p class="summary">Every important AI story, deduplicated across dozens of sources, ranked and summarized. Updated every 20 minutes.</p>
{tldr_html}
{''.join(days_html) or '<div class="meta">No stories yet.</div>'}
"""

    return _base_html(
        title="PulseAI — Real-Time AI News",
        description="The most important AI news, deduplicated, ranked and summarized every 20 minutes.",
        canonical=canonical,
        og_image=og_image,
        og_type="website",
        body_html=body,
    )


def render_digest_html(digest: dict) -> str:
    date = digest.get("date", "")
    bullets = digest.get("bullets", []) or []
    top = digest.get("top_stories", []) or []
    canonical = _absurl(f"/digest/{date}")
    og_image = _absurl(f"/api/og/digest/{date}.png")

    try:
        day_label = datetime.fromisoformat(date).strftime("%A, %b %-d, %Y")
    except Exception:
        day_label = date

    body = f"""
<div class="kicker">24-hour digest · {esc(date)}</div>
<h1>Today in AI — {esc(day_label)}</h1>
<ul class="bullets">{''.join(f'<li>{esc(b)}</li>' for b in bullets)}</ul>
<h2>Top stories</h2>
{''.join(f'<div class="row"><a href="{esc(_absurl("/story/"+ (s.get("category") or "news").lower().replace(" & ","-").replace(" ","-") +"/"+ s["slug"]))}">{esc(s.get("headline",""))}</a><div class="meta">{esc(s.get("category",""))} · {s.get("source_count",0)} sources</div></div>' for s in top)}
"""
    return _base_html(
        title=f"Today in AI — {day_label} — PulseAI",
        description=(bullets[0] if bullets else f"AI news digest for {date}") + " · 5-bullet daily digest by PulseAI",
        canonical=canonical,
        og_image=og_image,
        og_type="article",
        body_html=body,
    )
