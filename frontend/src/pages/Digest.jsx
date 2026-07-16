import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import dayjs from "dayjs";
import { Zap } from "lucide-react";
import api, { CATEGORY_SHORT, categorySlug } from "@/lib/api";

export default function Digest() {
  const { date } = useParams();
  const [digest, setDigest] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    document.title = `AI Digest ${date} — PulseAI`;
    api.get(`/digest/${date}`).then((r) => setDigest(r.data)).catch(() => setError(true));
  }, [date]);

  if (error) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center" data-testid="digest-not-found">
      <p className="font-serif text-2xl mb-3">No digest for {date}</p>
      <Link to="/" className="text-primary text-sm hover:underline">Back to the feed</Link>
    </div>
  );

  if (!digest) return <div className="max-w-3xl mx-auto px-4 pt-10"><div className="h-64 rounded-xl border border-border/60 bg-card animate-pulse" /></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 fade-up">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary mb-3"><Zap size={13} /> Daily Digest</div>
      <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight mb-8" data-testid="digest-title">
        {dayjs(date).format("dddd, MMMM D, YYYY")}
      </h1>
      <ol className="space-y-4 mb-12" data-testid="digest-bullets">
        {digest.bullets.map((b, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
            <span className="font-serif text-primary font-bold tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <span>{b}</span>
          </li>
        ))}
      </ol>
      {digest.top_stories?.length > 0 && (
        <section data-testid="digest-top-stories">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Top stories that day</h2>
          <div className="space-y-2">
            {digest.top_stories.map((s, i) => (
              <Link key={s.slug} to={`/story/${categorySlug(s.category)}/${s.slug}`}
                className="flex gap-3 p-4 rounded-lg border border-border/60 bg-card hover:border-primary/50 transition-colors duration-150">
                <span className="font-serif text-muted-foreground/50">{i + 1}</span>
                <div>
                  <p className="font-serif font-semibold leading-snug">{s.headline}</p>
                  <p className="text-xs text-muted-foreground mt-1">{CATEGORY_SHORT[s.category] || s.category} · {s.source_count} sources</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
