"""OG image generation for PulseAI share cards (1200x630 PNG)."""
import hashlib
import re
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONTS = Path(__file__).parent / "assets" / "fonts"
CACHE = Path(__file__).parent / "cache" / "og"
CACHE.mkdir(parents=True, exist_ok=True)

W, H = 1200, 630
BG = (10, 10, 10)
FG = (245, 245, 245)
DIM = (156, 163, 175)
LINE = (39, 39, 42)
ACCENT = (251, 191, 36)  # amber-400

CATEGORY_COLORS = {
    "AI Models": (167, 139, 250),
    "Chips & Compute": (251, 191, 36),
    "Business & Funding": (52, 211, 153),
    "Policy & Regulation": (248, 113, 113),
    "Security": (244, 63, 94),
    "Research": (129, 140, 248),
    "Products & Tools": (251, 191, 36),
    "Markets": (34, 211, 238),
}

_font_cache = {}


def font(name, size, axes=None):
    key = (name, size, tuple(axes) if axes else None)
    if key not in _font_cache:
        path = FONTS / name
        f = ImageFont.truetype(str(path), size)
        if axes:
            try:
                f.set_variation_by_axes(list(axes))
            except Exception:
                pass
        _font_cache[key] = f
    return _font_cache[key]


def _text_w(draw, s, f):
    b = draw.textbbox((0, 0), s, font=f)
    return b[2] - b[0]


def _wrap(draw, text, f, max_w, max_lines=4):
    words = text.split()
    lines = []
    cur = ""
    for w in words:
        candidate = (cur + " " + w).strip()
        if _text_w(draw, candidate, f) <= max_w:
            cur = candidate
        else:
            if cur:
                lines.append(cur)
            cur = w
            if len(lines) >= max_lines:
                break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    # Ellipsize if text was truncated
    remaining = words[sum(len(ln.split()) for ln in lines):]
    if remaining and lines:
        last = lines[-1]
        while _text_w(draw, last + "…", f) > max_w and " " in last:
            last = last.rsplit(" ", 1)[0]
        lines[-1] = last + "…"
    return lines


def _fit_headline(draw, headline, max_w, max_lines=4, big=88, small=48):
    """Auto-scale font size so headline fits within max_lines."""
    for size in range(big, small - 1, -6):
        f = font("PlayfairDisplay-Bold.ttf", size, axes=[900])
        lines = _wrap(draw, headline, f, max_w, max_lines=max_lines + 1)
        if len(lines) <= max_lines:
            return f, _wrap(draw, headline, f, max_w, max_lines=max_lines), size
    f = font("PlayfairDisplay-Bold.ttf", small, axes=[900])
    return f, _wrap(draw, headline, f, max_w, max_lines=max_lines), small


def _wordmark(draw, x, y):
    # Small dot + wordmark
    r = 8
    draw.ellipse([x, y + 8, x + r * 2, y + 8 + r * 2], fill=ACCENT)
    f = font("Inter-Regular.ttf", 26, axes=[700])
    draw.text((x + r * 2 + 12, y + 2), "PulseAI", font=f, fill=FG)


def _chip(draw, x, y, label, color):
    f = font("Inter-Regular.ttf", 22, axes=[600])
    tw = _text_w(draw, label.upper(), f)
    pad_x, pad_y = 16, 8
    box = [x, y, x + tw + pad_x * 2, y + 22 + pad_y * 2]
    # Filled chip using color at ~15% opacity via overlay
    overlay = Image.new("RGBA", (int(box[2] - box[0]), int(box[3] - box[1])), color + (40,))
    img = draw._image
    img.paste(overlay, (int(box[0]), int(box[1])), overlay)
    # Border
    draw.rectangle(box, outline=color, width=2)
    draw.text((x + pad_x, y + pad_y - 2), label.upper(), font=f, fill=color)
    return box[2]  # right edge


def render_story_card(story: dict) -> bytes:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Subtle top gradient stripe
    draw.rectangle([0, 0, W, 4], fill=ACCENT)

    # Header
    _wordmark(draw, 64, 56)
    tag_f = font("Inter-Regular.ttf", 20, axes=[600])
    draw.text((W - 64 - _text_w(draw, "REAL-TIME AI NEWS", tag_f), 62), "REAL-TIME AI NEWS", font=tag_f, fill=DIM)

    # Category chip
    cat = story.get("category") or "News"
    color = CATEGORY_COLORS.get(cat, ACCENT)
    _chip(draw, 64, 148, cat, color)

    # Headline
    headline = story.get("headline") or ""
    hf, lines, size = _fit_headline(draw, headline, max_w=W - 128)
    y = 214
    lh = int(size * 1.15)
    for ln in lines:
        draw.text((64, y), ln, font=hf, fill=FG)
        y += lh

    # Footer separator
    draw.line([(64, H - 108), (W - 64, H - 108)], fill=LINE, width=1)

    # Footer: sources · date on left, domain on right
    footer_f = font("Inter-Regular.ttf", 22, axes=[500])
    src_count = story.get("source_count", 0)
    date_str = (story.get("first_seen") or "")[:10]
    left = f"{src_count} source{'s' if src_count != 1 else ''}  ·  {date_str}"
    draw.text((64, H - 78), left, font=footer_f, fill=DIM)

    domain_f = font("Inter-Regular.ttf", 22, axes=[600])
    domain = os.environ.get("SITE_URL", "").replace("https://", "").replace("http://", "").rstrip("/")
    if domain:
        dw = _text_w(draw, domain, domain_f)
        draw.text((W - 64 - dw, H - 78), domain, font=domain_f, fill=ACCENT)

    from io import BytesIO
    out = BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def render_digest_card(date: str, bullets: list) -> bytes:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, W, 4], fill=ACCENT)

    _wordmark(draw, 64, 56)
    tag_f = font("Inter-Regular.ttf", 20, axes=[600])
    draw.text((W - 64 - _text_w(draw, "24-HOUR DIGEST", tag_f), 62), "24-HOUR DIGEST", font=tag_f, fill=DIM)

    # Title
    title_f = font("PlayfairDisplay-Bold.ttf", 68, axes=[900])
    # Format date
    try:
        from datetime import datetime
        d = datetime.fromisoformat(date).strftime("%b %-d, %Y")
    except Exception:
        d = date
    title = f"Today in AI — {d}"
    # If title too long, scale down
    if _text_w(draw, title, title_f) > W - 128:
        title_f = font("PlayfairDisplay-Bold.ttf", 54, axes=[900])
    draw.text((64, 138), title, font=title_f, fill=FG)

    # 5 bullets
    bf = font("Inter-Regular.ttf", 24, axes=[500])
    y = 246
    max_w = W - 128 - 36
    for i, b in enumerate(bullets[:5]):
        # Bullet dot
        draw.ellipse([64, y + 12, 74, y + 22], fill=ACCENT)
        # Wrap each bullet to max 2 lines
        lines = _wrap(draw, b, bf, max_w, max_lines=2)
        for j, ln in enumerate(lines):
            draw.text((92, y + j * 32), ln, font=bf, fill=FG if j == 0 else DIM)
        y += 32 * len(lines) + 12

    # Footer
    domain_f = font("Inter-Regular.ttf", 22, axes=[600])
    domain = os.environ.get("SITE_URL", "").replace("https://", "").replace("http://", "").rstrip("/")
    if domain:
        dw = _text_w(draw, domain, domain_f)
        draw.text((W - 64 - dw, H - 62), domain, font=domain_f, fill=ACCENT)

    from io import BytesIO
    out = BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def render_default_card() -> bytes:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, W, 4], fill=ACCENT)

    # Big wordmark centered
    r = 24
    logo_y = H // 2 - 120
    draw.ellipse([W // 2 - 180, logo_y, W // 2 - 180 + r * 2, logo_y + r * 2], fill=ACCENT)
    wm_f = font("Inter-Regular.ttf", 96, axes=[800])
    text = "PulseAI"
    tw = _text_w(draw, text, wm_f)
    draw.text(((W - tw) // 2 + 20, logo_y - 16), text, font=wm_f, fill=FG)

    # Tagline
    tf = font("PlayfairDisplay-Bold.ttf", 42, axes=[600])
    tag = "The most important AI news, in real time."
    tw = _text_w(draw, tag, tf)
    draw.text(((W - tw) // 2, H // 2 + 60), tag, font=tf, fill=DIM)

    # Sub
    sf = font("Inter-Regular.ttf", 22, axes=[500])
    sub = "Deduplicated. Ranked. Rewritten."
    sw = _text_w(draw, sub, sf)
    draw.text(((W - sw) // 2, H // 2 + 118), sub, font=sf, fill=ACCENT)

    from io import BytesIO
    out = BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def cache_key_story(story: dict) -> str:
    h = hashlib.md5((story.get("headline", "") + "|" + story.get("category", "") + "|" + str(story.get("source_count", ""))).encode()).hexdigest()[:12]
    return f"story-{story['id']}-{h}.png"


def cache_key_digest(date: str, bullets_hash: str) -> str:
    return f"digest-{date}-{bullets_hash[:10]}.png"


def cached_or_generate(name: str, generator):
    """Return (bytes, cached: bool)."""
    p = CACHE / name
    if p.exists():
        return p.read_bytes(), True
    # Purge older siblings for the same base id to prevent unbounded growth
    base = "-".join(name.split("-")[:2])
    for old in CACHE.glob(f"{base}-*.png"):
        if old.name != name:
            try:
                old.unlink()
            except Exception:
                pass
    data = generator()
    p.write_bytes(data)
    return data, False
