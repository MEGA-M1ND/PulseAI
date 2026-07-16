import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Zap, Share2 } from "lucide-react";
import { toast } from "sonner";

dayjs.extend(relativeTime);

export const TldrHero = ({ tldr, loading }) => {
  const share = () => {
    navigator.clipboard.writeText(window.location.origin);
    toast.success("Link copied");
  };

  if (loading) {
    return (
      <div className="border border-border/60 rounded-xl p-6 sm:p-8 space-y-3 animate-pulse bg-card" data-testid="tldr-skeleton">
        <div className="h-4 w-32 bg-secondary rounded" />
        <div className="h-8 w-2/3 bg-secondary rounded" />
        {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-secondary rounded" style={{ width: `${90 - i * 8}%` }} />)}
      </div>
    );
  }

  if (!tldr?.bullets?.length) {
    return (
      <div className="border border-border/60 rounded-xl p-6 sm:p-8 bg-card" data-testid="tldr-empty">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary mb-2"><Zap size={13} /> Today in AI</div>
        <p className="text-sm text-muted-foreground">The digest is being generated — the pipeline is ingesting its first stories. Check back in a few minutes.</p>
      </div>
    );
  }

  return (
    <div data-testid="tldr-hero"
      className="relative overflow-hidden rounded-xl border border-primary/25 bg-card p-6 sm:p-8 fade-up">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 50% at 15% 0%, hsl(221 83% 53% / 0.12), transparent)" }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary">
            <Zap size={13} /> Today in AI
          </div>
          <button onClick={share} data-testid="tldr-share-btn" aria-label="Share digest"
            className="p-1.5 rounded-full text-muted-foreground hover:text-primary transition-colors duration-150">
            <Share2 size={14} />
          </button>
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight mb-5">The last 24 hours, in 5 bullets</h1>
        <ol className="space-y-3.5" data-testid="tldr-bullets">
          {tldr.bullets.map((b, i) => (
            <li key={i} className="flex gap-3 text-sm sm:text-[15px] leading-relaxed">
              <span className="font-serif text-primary font-bold shrink-0 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span>{b}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-muted-foreground" data-testid="tldr-timestamp">
          Updated {dayjs(tldr.generated_at).fromNow()}
        </p>
      </div>
    </div>
  );
};

export default TldrHero;
