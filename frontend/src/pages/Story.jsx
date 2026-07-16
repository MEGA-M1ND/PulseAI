import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  ArrowLeft,
  ExternalLink,
  Share2,
  Linkedin,
  Bookmark,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import api, { CATEGORY_SHORT, categorySlug } from "@/lib/api";
import { isBookmarked, toggleBookmark } from "@/lib/bookmarks";

dayjs.extend(relativeTime);

const ROLE_COLOR = {
  SOURCE: "text-primary",
  ENGAGEMENT: "text-primary/70",
  SUPPORT: "text-emerald-400",
  ANALYSIS: "text-purple-400",
};

const timeShort = (t) => {
  const d = dayjs(t);
  const hoursAgo = dayjs().diff(d, "hour");
  if (hoursAgo < 24) return dayjs().diff(d, "hour") + "h ago";
  return d.format("MMM D h:mma").replace(":00", "").toLowerCase();
};

const setMeta = (name, content, attr = "name") => {
  let m = document.querySelector(`meta[${attr}="${name}"]`);
  if (!m) {
    m = document.createElement("meta");
    m.setAttribute(attr, name);
    document.head.appendChild(m);
  }
  m.setAttribute("content", content);
};

export default function Story() {
  const { slug } = useParams();
  const [story, setStory] = useState(null);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setStory(null);
    setError(false);
    api.get(`/story/${slug}`).then((r) => {
      setStory(r.data);
      setSaved(isBookmarked(r.data.id));

      const title = `${r.data.headline} — PulseAI`;
      document.title = title;
      const backendBase = process.env.REACT_APP_BACKEND_URL || "";
      const ogUrl = `${backendBase}/api/og/story/${r.data.id}.png`;
      const canonical = window.location.href;

      setMeta("description", r.data.summary || r.data.headline);
      setMeta("og:title", title, "property");
      setMeta("og:description", r.data.summary || r.data.headline, "property");
      setMeta("og:type", "article", "property");
      setMeta("og:url", canonical, "property");
      setMeta("og:image", ogUrl, "property");
      setMeta("og:image:width", "1200", "property");
      setMeta("og:image:height", "630", "property");
      setMeta("twitter:card", "summary_large_image");
      setMeta("twitter:title", title);
      setMeta("twitter:description", r.data.summary || r.data.headline);
      setMeta("twitter:image", ogUrl);

      // canonical link
      let link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", canonical);

      // JSON-LD
      document.getElementById("story-jsonld")?.remove();
      const ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.id = "story-jsonld";
      ld.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: r.data.headline,
        description: r.data.summary,
        datePublished: r.data.first_seen,
        dateModified: r.data.last_updated,
        url: canonical,
        image: ogUrl,
        articleSection: r.data.category,
        keywords: [...(r.data.tags || []), ...(r.data.keywords || [])].join(", "),
        isBasedOn: (r.data.sources || []).slice(0, 20).map((s) => s.url).filter(Boolean),
        citation: (r.data.sources || []).slice(0, 20).map((s) => ({
          "@type": "CreativeWork", url: s.url, name: s.source,
        })),
        publisher: { "@type": "Organization", name: "PulseAI", url: backendBase },
      });
      document.head.appendChild(ld);
    }).catch(() => setError(true));
    return () => document.getElementById("story-jsonld")?.remove();
  }, [slug]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") navigate(-1); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied");
  };
  const shareX = () =>
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(story.headline)}&url=${encodeURIComponent(window.location.href)}`, "_blank");
  const shareLi = () =>
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`, "_blank");

  if (error) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center" data-testid="story-not-found">
      <p className="font-serif text-2xl mb-3">Story not found</p>
      <Link to="/" className="text-primary text-sm hover:underline">Back to the feed</Link>
    </div>
  );

  if (!story) return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 space-y-4 animate-pulse" data-testid="story-skeleton">
      <div className="h-4 w-24 bg-secondary rounded" />
      <div className="h-10 w-full bg-secondary rounded" />
      <div className="h-10 w-3/4 bg-secondary rounded" />
      <div className="h-20 w-full bg-secondary rounded" />
    </div>
  );

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 fade-up">
      <Link to="/" data-testid="story-back-link" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-6">
        <ArrowLeft size={14} /> Feed
      </Link>

      <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
        {story.category && (
          <span className="text-primary text-[11px] uppercase tracking-[0.16em] font-semibold" data-testid="story-page-category">
            {CATEGORY_SHORT[story.category] || story.category}
          </span>
        )}
        {story.is_updated && (
          <span className="inline-flex items-center gap-1 text-primary">
            <TrendingUp size={12} /> <span className="text-[10px] font-semibold uppercase">Updated</span>
          </span>
        )}
        <span className="text-muted-foreground">
          {dayjs(story.first_seen).format("MMM D, YYYY h:mma")} · Updated {dayjs(story.last_updated).fromNow()}
        </span>
      </div>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight mb-5" data-testid="story-headline">
        {story.headline}
      </h1>

      {/* Topics / Tags / Keywords */}
      <div className="space-y-2 mb-6 max-w-3xl">
        <MetaRow label="TOPICS">
          <TopicChip label="AI" emoji="🤖" />
          <TopicChip label="Tech" emoji="💻" />
        </MetaRow>
        {story.tags?.length > 0 && (
          <MetaRow label="TAGS">
            {story.tags.map((t) => <Chip key={t} label={t} />)}
          </MetaRow>
        )}
        {story.keywords?.length > 0 && (
          <MetaRow label="KEYWORDS">
            {story.keywords.map((k) => <Chip key={k} label={k} muted />)}
          </MetaRow>
        )}
      </div>

      {story.summary && (
        <div className="text-base sm:text-lg leading-relaxed text-foreground/85 mb-8 space-y-4 max-w-3xl" data-testid="story-summary">
          {story.summary.split(/\n{2,}|(?<=\.)\s{2,}/).map((p, i) => <p key={i}>{p}</p>)}
        </div>
      )}

      {story.continues_from && (
        <Link
          to={`/story/${categorySlug(story.continues_from.category)}/${story.continues_from.slug}`}
          data-testid="continues-from"
          className="block mb-8 p-4 border border-dashed border-border/70 rounded-md hover:border-primary/50 transition-colors max-w-3xl"
        >
          <div className="text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase mb-1">
            Continues from {dayjs(story.continues_from.first_seen).format("dddd, MMM D")}
          </div>
          <div className="font-serif text-[15px] font-semibold leading-snug">{story.continues_from.headline}</div>
          <div className="text-xs text-muted-foreground mt-1">{story.continues_from.source_count} sources</div>
        </Link>
      )}

      <div className="flex items-center gap-2 mb-10">
        <button onClick={shareX} data-testid="share-x-btn" className="px-3.5 py-1.5 rounded-full border border-border text-xs hover:border-primary transition-colors duration-150">
          Share on X
        </button>
        <button onClick={shareLi} data-testid="share-linkedin-btn" className="p-2 rounded-full border border-border hover:border-primary transition-colors duration-150">
          <Linkedin size={13} />
        </button>
        <button onClick={copyLink} data-testid="share-copy-btn" className="p-2 rounded-full border border-border hover:border-primary transition-colors duration-150">
          <Share2 size={13} />
        </button>
        <button onClick={() => { setSaved(toggleBookmark(story)); }} data-testid="story-bookmark-btn"
          className={`p-2 rounded-full border transition-colors duration-150 ${saved ? "border-primary text-primary" : "border-border hover:border-primary"}`}>
          <Bookmark size={13} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      <section className="mb-10 max-w-3xl">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          Key sources — {story.source_count} total
        </h2>
        <div className="divide-y divide-border/40" data-testid="source-list">
          {story.sources.map((src, i) => (
            <div key={i} className="grid grid-cols-[100px_1fr] sm:grid-cols-[110px_160px_1fr] gap-2 sm:gap-3 py-2.5 items-start text-[13px]">
              <span className={`text-[10px] font-bold tracking-[0.14em] uppercase ${ROLE_COLOR[src.role || "SOURCE"] || "text-primary"}`}>
                {src.role || "SOURCE"}
              </span>
              <div className="hidden sm:flex items-center gap-2 text-foreground/90 min-w-0">
                <span className="truncate font-medium">{src.source}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">{timeShort(src.published_at)}</span>
              </div>
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">—</span>
                <a href={src.url} target="_blank" rel="noopener noreferrer" data-testid={`source-link-${i}`}
                  className="text-foreground/80 hover:text-primary flex-1 min-w-0">
                  <span className="line-clamp-2">{src.title}</span>
                  <ExternalLink size={10} className="inline ml-1 text-muted-foreground/60" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {story.related?.length > 0 && (
        <section className="mb-10 max-w-3xl" data-testid="related-stories">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Related</h2>
          <div className="space-y-1">
            {story.related.map((r) => (
              <Link key={r.id} to={`/story/${categorySlug(r.category)}/${r.slug}`}
                className="block py-2 border-b border-border/40 hover:bg-secondary/30 px-2 -mx-2 rounded transition-colors">
                <p className="font-serif font-semibold leading-snug text-[15px]">{r.headline}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {CATEGORY_SHORT[r.category] || r.category} · {r.source_count} sources · {dayjs(r.first_seen).fromNow()}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

const Chip = ({ label, muted }) => (
  <span
    className={`inline-flex items-center px-3 py-1 rounded-full border text-[12px] ${
      muted
        ? "border-border/60 text-muted-foreground bg-transparent"
        : "border-border text-foreground bg-secondary/50"
    }`}
  >
    {label}
  </span>
);

const TopicChip = ({ label, emoji }) => (
  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-secondary/50 text-[12px]">
    <span aria-hidden>{emoji}</span> {label}
  </span>
);

const MetaRow = ({ label, children }) => (
  <div className="flex items-start gap-3">
    <span className="text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase w-20 shrink-0 pt-1.5">
      {label}
    </span>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);
