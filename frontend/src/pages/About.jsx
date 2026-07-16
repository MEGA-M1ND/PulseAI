import { useEffect } from "react";

const STEPS = [
  ["Ingest", "Every 20 minutes we pull from 13+ sources: TechCrunch, The Verge, Wired, company blogs (OpenAI, DeepMind, NVIDIA, Hugging Face), Hacker News and more."],
  ["Cluster", "Articles covering the same event are merged into a single story — you never see the same news twice."],
  ["Rewrite", "An LLM rewrites every headline into factual, neutral phrasing with concrete numbers. No clickbait."],
  ["Rank", "Stories are scored by source count, momentum, and recency. What matters rises to the top."],
  ["Digest", "Every hour we generate a 5-bullet TL;DR of the last 24 hours in plain English."],
];

export default function About() {
  useEffect(() => { document.title = "About — PulseAI"; }, []);
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 fade-up">
      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4" data-testid="about-title">
        All of AI news. None of the noise.
      </h1>
      <p className="text-muted-foreground leading-relaxed mb-12 max-w-xl">
        PulseAI is an automated news desk. It reads dozens of AI news sources around the clock, removes duplicates,
        rewrites headlines without hype, and ranks what actually matters. Every story links out to the original
        publishers — we send traffic to journalism, we don't replace it.
      </p>
      <div className="space-y-6" data-testid="about-steps">
        {STEPS.map(([title, desc], i) => (
          <div key={title} className="flex gap-5 p-5 rounded-lg border border-border/60 bg-card">
            <span className="font-serif text-2xl font-light text-primary tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h2 className="font-serif text-lg font-semibold mb-1">{title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
