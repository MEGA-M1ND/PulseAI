import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import { Search } from "lucide-react";
import api, { categorySlug } from "@/lib/api";
import TldrHero from "@/components/TldrHero";
import FilterBar from "@/components/FilterBar";
import StoryCard from "@/components/StoryCard";
import Newsletter from "@/components/Newsletter";

const dayLabel = (d) => {
  const date = dayjs(d);
  if (date.isSame(dayjs(), "day")) return "Today";
  if (date.isSame(dayjs().subtract(1, "day"), "day")) return "Yesterday";
  return date.format("dddd, MMM D");
};

export default function Home() {
  const [params, setParams] = useSearchParams();
  const tag = params.get("tag") || "All";
  const [stories, setStories] = useState(null);
  const [tldr, setTldr] = useState(null);
  const [tldrLoading, setTldrLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selIdx, setSelIdx] = useState(-1);
  const searchRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "PulseAI — Real-Time AI News";
    api.get("/tldr").then((r) => setTldr(r.data)).finally(() => setTldrLoading(false));
  }, []);

  useEffect(() => {
    setStories(null);
    api.get("/feed", { params: { tag: tag !== "All" ? tag : undefined } })
      .then((r) => setStories(r.data.stories))
      .catch(() => setStories([]));
  }, [tag]);

  const filtered = useMemo(() => {
    if (!stories) return null;
    const q = query.trim().toLowerCase();
    return q ? stories.filter((s) => s.headline.toLowerCase().includes(q)) : stories;
  }, [stories, query]);

  const groups = useMemo(() => {
    if (!filtered) return [];
    const map = new Map();
    filtered.forEach((s) => {
      const key = dayjs(s.first_seen).format("YYYY-MM-DD");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const flat = useMemo(() => groups.flatMap(([, list]) => list), [groups]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "j") setSelIdx((i) => Math.min(i + 1, flat.length - 1));
      else if (e.key === "k") setSelIdx((i) => Math.max(i - 1, 0));
      else if (e.key === "Enter" && selIdx >= 0 && flat[selIdx]) {
        const s = flat[selIdx];
        navigate(`/story/${categorySlug(s.category)}/${s.slug}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, selIdx, navigate]);

  useEffect(() => {
    if (selIdx >= 0) document.querySelector(`[data-flatidx="${selIdx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selIdx]);

  const setTag = (t) => {
    setSelIdx(-1);
    setParams(t === "All" ? {} : { tag: t }, { replace: false });
  };

  let flatCounter = -1;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
      <TldrHero tldr={tldr} loading={tldrLoading} />

      <div className="mt-8">
        <FilterBar active={tag} onSelect={setTag} />
      </div>

      <div className="relative mt-6">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input ref={searchRef} data-testid="search-input" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search headlines…"
          className="w-full h-11 pl-11 pr-12 rounded-full bg-card border border-border text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
        <kbd className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">/</kbd>
      </div>

      <div className="mt-8 space-y-10" data-testid="story-feed">
        {filtered === null && (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 rounded-lg border border-border/60 bg-card animate-pulse" />
            ))}
          </div>
        )}

        {filtered && filtered.length === 0 && (
          <div className="text-center py-16 border border-dashed border-border rounded-lg" data-testid="feed-empty-state">
            <p className="font-serif text-xl mb-2">Nothing here yet</p>
            <p className="text-sm text-muted-foreground">
              {query ? "No headlines match your search." : "The pipeline is ingesting its first stories — check back in a few minutes."}
            </p>
          </div>
        )}

        {groups.map(([date, list], gi) => (
          <Fragment key={date}>
            <section>
              <div className="flex items-baseline gap-3 mb-4 border-b border-border/60 pb-2">
                <h2 className="font-serif text-lg font-semibold" data-testid={`day-header-${date}`}>{dayLabel(date)}</h2>
                <span className="text-xs text-muted-foreground">{list.length} stories</span>
              </div>
              <div className="space-y-3">
                {list.map((s, i) => {
                  flatCounter += 1;
                  const idx = flatCounter;
                  return (
                    <div key={s.id} data-flatidx={idx}>
                      <StoryCard story={s} rank={i + 1} selected={idx === selIdx} />
                    </div>
                  );
                })}
              </div>
            </section>
            {gi === 0 && groups.length > 1 && <Newsletter />}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
