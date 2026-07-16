import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { ArrowLeft, ExternalLink, Share2, Linkedin, Bookmark } from "lucide-react";
import { toast } from "sonner";
import api, { CATEGORY_SHORT, categorySlug } from "@/lib/api";
import { isBookmarked, toggleBookmark } from "@/lib/bookmarks";

dayjs.extend(relativeTime);

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
      document.title = `${r.data.headline} — PulseAI`;
      let meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute("content", r.data.summary || r.data.headline);
      const ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.id = "story-jsonld";
      ld.text = JSON.stringify({
        "@context": "https://schema.org", "@type": "NewsArticle",
        headline: r.data.headline, description: r.data.summary,
        datePublished: r.data.first_seen, dateModified: r.data.last_updated,
      });
      document.getElementById("story-jsonld")?.remove();
      document.head.appendChild(ld);
    }).catch(() => setError(true));
    return () => document.getElementById("story-jsonld")?.remove();
  }, [slug]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") navigate(-1); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const copyLink = () => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); };
  const shareX = () => window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(story.headline)}&url=${encodeURIComponent(window.location.href)}`, "_blank");
  const shareLi = () => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`, "_blank");

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
    <article className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 fade-up">
      <Link to="/" data-testid="story-back-link" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-6">
        <ArrowLeft size={14} /> Feed
      </Link>

      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        {story.category && (
          <span className="px-2.5 py-1 rounded-full border border-primary/40 text-primary uppercase tracking-wider" data-testid="story-page-category">
            {CATEGORY_SHORT[story.category] || story.category}
          </span>
        )}
        {story.is_updated && <span className="px-2 py-0.5 rounded border border-primary text-primary font-semibold uppercase text-[10px]">Updated</span>}
        <span className="text-muted-foreground">First seen {dayjs(story.first_seen).fromNow()} · Updated {dayjs(story.last_updated).fromNow()}</span>
      </div>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight mb-5" data-testid="story-headline">
        {story.headline}
      </h1>

      {story.summary && <p className="text-base sm:text-lg leading-relaxed text-muted-foreground mb-6" data-testid="story-summary">{story.summary}</p>}

      <div className="flex items-center gap-2 mb-10">
        <button onClick={shareX} data-testid="share-x-btn" className="px-3.5 py-1.5 rounded-full border border-border text-xs hover:border-primary transition-colors duration-150">Share on X</button>
        <button onClick={shareLi} data-testid="share-linkedin-btn" className="p-2 rounded-full border border-border hover:border-primary transition-colors duration-150"><Linkedin size={13} /></button>
        <button onClick={copyLink} data-testid="share-copy-btn" className="p-2 rounded-full border border-border hover:border-primary transition-colors duration-150"><Share2 size={13} /></button>
        <button onClick={() => { setSaved(toggleBookmark(story)); }} data-testid="story-bookmark-btn"
          className={`p-2 rounded-full border transition-colors duration-150 ${saved ? "border-primary text-primary" : "border-border hover:border-primary"}`}>
          <Bookmark size={13} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Coverage — {story.source_count} source{story.source_count !== 1 ? "s" : ""}</h2>
        <div className="space-y-2" data-testid="source-list">
          {story.sources.map((src, i) => (
            <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" data-testid={`source-link-${i}`}
              className="group flex items-start justify-between gap-4 p-4 rounded-lg border border-border/60 bg-card hover:border-primary/50 transition-colors duration-150">
              <div className="min-w-0">
                <p className="text-xs text-primary mb-1">{src.source}</p>
                <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors duration-150">{src.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{dayjs(src.published_at).fromNow()}</p>
              </div>
              <ExternalLink size={14} className="shrink-0 mt-1 text-muted-foreground group-hover:text-primary transition-colors duration-150" />
            </a>
          ))}
        </div>
      </section>

      {story.timeline?.length > 1 && (
        <section className="mb-10" data-testid="story-timeline">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">How this developed</h2>
          <div className="space-y-3 border-l border-border pl-4">
            {story.timeline.map((t, i) => (
              <div key={i} className="text-sm">
                <span className="text-muted-foreground text-xs">{dayjs(t.time).format("MMM D, HH:mm")}</span>
                <p>{t.note}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {story.related?.length > 0 && (
        <section className="mb-10" data-testid="related-stories">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Related</h2>
          <div className="space-y-2">
            {story.related.map((r) => (
              <Link key={r.id} to={`/story/${categorySlug(r.category)}/${r.slug}`}
                className="block p-4 rounded-lg border border-border/60 bg-card hover:border-primary/50 transition-colors duration-150">
                <p className="font-serif font-semibold leading-snug">{r.headline}</p>
                <p className="text-xs text-muted-foreground mt-1">{r.source_count} sources · {dayjs(r.first_seen).fromNow()}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
