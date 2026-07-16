import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Bookmark, ChevronDown, TrendingUp, Share2, Linkedin, ExternalLink } from "lucide-react";
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

export const StoryRow = ({ story, rank, expanded, onToggle, selected }) => {
  const [full, setFull] = useState(null);
  const [saved, setSaved] = useState(() => isBookmarked(story.id));

  useEffect(() => {
    if (expanded && !full) {
      api.get(`/story/${story.slug}`).then((r) => setFull(r.data)).catch(() => {});
    }
  }, [expanded, full, story.slug]);

  const permalink = `/story/${categorySlug(story.category)}/${story.slug}`;
  const totalCoverage = full?.sources?.length ?? story.source_count;
  const uniqueSources = full
    ? new Set(full.sources.map((s) => s.source)).size
    : Math.min(story.source_count, story.source_names?.length ?? story.source_count);

  const onBookmark = (e) => {
    e.stopPropagation();
    const now = toggleBookmark(story);
    setSaved(now);
    toast(now ? "Story saved" : "Removed from saved");
  };

  const copyLink = (e) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(window.location.origin + permalink);
    toast.success("Link copied");
  };

  const shareX = (e) => {
    e?.stopPropagation();
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(story.headline)}&url=${encodeURIComponent(
        window.location.origin + permalink,
      )}`,
      "_blank",
    );
  };

  const shareLi = (e) => {
    e?.stopPropagation();
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.origin + permalink)}`,
      "_blank",
    );
  };

  return (
    <div
      data-testid={`story-row-${story.id}`}
      className={`border-l-2 pl-3 sm:pl-4 py-3 transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-transparent"
      }`}
    >
      {/* Collapsed header row */}
      <button
        onClick={onToggle}
        data-testid={`story-row-toggle-${story.id}`}
        className="w-full text-left flex items-start gap-3 group"
      >
        <span className="font-serif text-sm text-muted-foreground/70 w-6 shrink-0 pt-0.5 tabular-nums text-right">
          {rank}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            {story.is_new && (
              <span
                data-testid="story-new-badge"
                className="text-[10px] font-bold text-primary tracking-wider uppercase mt-1"
              >
                NEW
              </span>
            )}
            {story.is_updated && (
              <TrendingUp size={13} className="text-primary shrink-0 mt-1.5" />
            )}
            <h3
              className={`font-serif text-[15px] sm:text-base font-semibold leading-snug ${
                story.is_new || story.is_updated ? "text-primary" : "text-foreground"
              } group-hover:text-primary transition-colors`}
            >
              {story.headline}
              {expanded && (
                <ChevronDown size={13} className="inline ml-1.5 -mt-0.5 text-muted-foreground rotate-180 transition-transform" />
              )}
              {!expanded && (
                <ChevronDown size={13} className="inline ml-1.5 -mt-0.5 text-muted-foreground/40 transition-transform" />
              )}
            </h3>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-4 shrink-0 text-xs text-muted-foreground pt-1">
          {story.category && (
            <span data-testid="story-category" className="text-muted-foreground">
              {CATEGORY_SHORT[story.category] || story.category}
            </span>
          )}
          <span className={story.is_new ? "text-primary" : ""} data-testid="story-time">
            {timeShort(story.first_seen)}
          </span>
          <span className="tabular-nums text-muted-foreground/80" data-testid="story-counts">
            {totalCoverage}/{uniqueSources}
          </span>
        </div>
      </button>

      {/* Mobile meta row */}
      <div className="sm:hidden flex items-center gap-3 text-[11px] text-muted-foreground mt-1 pl-9">
        {story.category && <span>{CATEGORY_SHORT[story.category] || story.category}</span>}
        <span>{timeShort(story.first_seen)}</span>
        <span className="tabular-nums">{totalCoverage}/{uniqueSources}</span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="pl-9 pr-2 mt-4 fade-up" data-testid={`story-expanded-${story.id}`}>
          {/* Topics / Tags / Keywords rows */}
          <MetaRow label="TOPICS">
            <TopicChip label="AI" emoji="🤖" />
            <TopicChip label="Tech" emoji="💻" />
          </MetaRow>

          {story.tags?.length > 0 && (
            <MetaRow label="TAGS">
              {story.tags.map((t) => (
                <Chip key={t} label={t} />
              ))}
            </MetaRow>
          )}

          {story.keywords?.length > 0 && (
            <MetaRow label="KEYWORDS">
              {story.keywords.map((k) => (
                <Chip key={k} label={k} muted />
              ))}
            </MetaRow>
          )}

          {/* Summary */}
          {story.summary && (
            <div className="mt-4 text-[14px] sm:text-[15px] leading-relaxed text-foreground/85 space-y-3 max-w-2xl">
              {story.summary.split(/\n{2,}|(?<=\.)\s{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}

          {/* Continues from */}
          {(story.continues_from || full?.continues_from) && (
            <ContinuesFrom cf={story.continues_from || full.continues_from} />
          )}

          {/* Key sources */}
          <KeySources full={full} story={story} permalink={permalink} />

          {/* Actions row */}
          <div className="mt-5 flex items-center gap-2 pb-2">
            <Link
              to={permalink}
              data-testid={`story-permalink-${story.id}`}
              className="text-xs text-muted-foreground hover:text-primary underline underline-offset-4"
            >
              Open permalink
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <button
              onClick={shareX}
              data-testid={`share-x-${story.id}`}
              className="text-xs text-muted-foreground hover:text-primary"
            >
              Share on X
            </button>
            <button
              onClick={shareLi}
              data-testid={`share-li-${story.id}`}
              className="p-1 rounded-full text-muted-foreground hover:text-primary"
              aria-label="Share on LinkedIn"
            >
              <Linkedin size={12} />
            </button>
            <button
              onClick={copyLink}
              data-testid={`share-copy-${story.id}`}
              className="p-1 rounded-full text-muted-foreground hover:text-primary"
              aria-label="Copy link"
            >
              <Share2 size={12} />
            </button>
            <button
              onClick={onBookmark}
              data-testid={`bookmark-btn-${story.id}`}
              className={`p-1 rounded-full ${saved ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
              aria-label={saved ? "Remove bookmark" : "Save story"}
            >
              <Bookmark size={12} fill={saved ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

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
  <div className="flex items-start gap-3 mt-2">
    <span className="text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase w-16 shrink-0 pt-1.5">
      {label}
    </span>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

const ContinuesFrom = ({ cf }) => (
  <Link
    to={`/story/${categorySlug(cf.category)}/${cf.slug}`}
    data-testid="continues-from"
    className="block mt-5 p-4 border border-dashed border-border/70 rounded-md hover:border-primary/50 transition-colors max-w-2xl"
  >
    <div className="text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase mb-1">
      Continues from {dayjs(cf.first_seen).format("dddd, MMM D")}
    </div>
    <div className="font-serif text-[15px] font-semibold leading-snug">{cf.headline}</div>
    <div className="text-xs text-muted-foreground mt-1">{cf.source_count} sources</div>
  </Link>
);

const KeySources = ({ full, story, permalink }) => {
  if (!full) {
    return (
      <div className="mt-5 space-y-2 max-w-3xl" data-testid="key-sources-loading">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-6 bg-secondary/50 rounded animate-pulse" style={{ width: `${80 - i * 10}%` }} />
        ))}
      </div>
    );
  }
  const sources = full.sources || [];
  const preview = sources.slice(0, 6);
  return (
    <div className="mt-5 max-w-3xl" data-testid="key-sources">
      <div className="text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase mb-2">
        Key sources
      </div>
      <div className="divide-y divide-border/40">
        {preview.map((s, i) => (
          <SourceLine key={i} src={s} idx={i} />
        ))}
      </div>
      {sources.length > preview.length && (
        <Link
          to={permalink}
          data-testid="see-all-sources"
          className="inline-block mt-3 text-sm text-foreground/90 hover:text-primary border-b border-border/60 hover:border-primary pb-0.5"
        >
          See all {sources.length} sources →
        </Link>
      )}
    </div>
  );
};

const SourceLine = ({ src, idx }) => {
  const role = src.role || "SOURCE";
  return (
    <div className="grid grid-cols-[100px_1fr] sm:grid-cols-[110px_140px_1fr] gap-2 sm:gap-3 py-2 items-start text-[13px]">
      <span
        className={`text-[10px] font-bold tracking-[0.14em] uppercase ${ROLE_COLOR[role] || "text-primary"}`}
        data-testid={`source-role-${idx}`}
      >
        {role}
      </span>
      <div className="hidden sm:flex items-center gap-2 text-foreground/90 min-w-0">
        <span className="truncate font-medium" data-testid={`source-name-${idx}`}>{src.source}</span>
        <span className="text-[11px] text-muted-foreground shrink-0">{timeShort(src.published_at)}</span>
      </div>
      <div className="flex items-start gap-2 min-w-0">
        <span className="text-muted-foreground shrink-0">—</span>
        <a
          href={src.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground/80 hover:text-primary flex-1 min-w-0"
          data-testid={`source-link-${idx}`}
        >
          <span className="line-clamp-2">{src.title}</span>
          <ExternalLink size={10} className="inline ml-1 text-muted-foreground/60" />
        </a>
      </div>
    </div>
  );
};

export default StoryRow;
