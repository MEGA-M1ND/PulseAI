import { useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Bookmark } from "lucide-react";
import { CATEGORY_SHORT, categorySlug } from "@/lib/api";
import { isBookmarked, toggleBookmark } from "@/lib/bookmarks";
import { toast } from "sonner";

dayjs.extend(relativeTime);

export const StoryCard = ({ story, rank, selected }) => {
  const [saved, setSaved] = useState(() => isBookmarked(story.id));

  const onBookmark = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nowSaved = toggleBookmark(story);
    setSaved(nowSaved);
    toast(nowSaved ? "Story saved" : "Removed from saved");
  };

  return (
    <Link to={`/story/${categorySlug(story.category)}/${story.slug}`}
      data-testid={`story-card-${story.id}`}
      className={`story-row group flex gap-4 px-4 sm:px-5 py-4 border rounded-lg bg-card hover:border-primary/50 ${selected ? "border-primary ring-1 ring-primary/40" : "border-border/60"}`}>
      <span className="font-serif text-2xl font-light text-muted-foreground/50 w-8 shrink-0 pt-0.5 text-right tabular-nums">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <h3 className="font-serif text-lg sm:text-xl font-semibold leading-snug tracking-tight group-hover:text-primary transition-colors duration-150">
          {story.headline}
        </h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
          {story.category && (
            <span data-testid="story-category-chip"
              className="px-2 py-0.5 rounded-full border border-primary/40 text-primary text-[11px] uppercase tracking-wider">
              {CATEGORY_SHORT[story.category] || story.category}
            </span>
          )}
          <span data-testid="story-source-count">{story.source_count} source{story.source_count !== 1 ? "s" : ""}</span>
          <span>{dayjs(story.first_seen).fromNow()}</span>
          {story.is_new && (
            <span data-testid="story-new-badge" className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-semibold uppercase tracking-wider">New</span>
          )}
          {story.is_updated && (
            <span data-testid="story-updated-badge" className="px-1.5 py-0.5 rounded border border-primary text-primary text-[10px] font-semibold uppercase tracking-wider">Updated</span>
          )}
        </div>
      </div>
      <button onClick={onBookmark} data-testid={`bookmark-btn-${story.id}`} aria-label="Save story"
        className={`self-start p-1.5 rounded-full transition-colors duration-150 hover:bg-secondary ${saved ? "text-primary" : "text-muted-foreground/40"}`}>
        <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
      </button>
    </Link>
  );
};

export default StoryCard;
