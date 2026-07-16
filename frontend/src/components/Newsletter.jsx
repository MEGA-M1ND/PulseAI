import { useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import api from "@/lib/api";

export const Newsletter = ({ compact }) => {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    try {
      await api.post("/newsletter", { email });
      toast.success("You're in. Daily AI TL;DR coming your way.");
      setEmail("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Subscription failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="newsletter-module"
      className={`border border-border/60 rounded-lg ${compact ? "p-6" : "p-6 sm:p-8"} bg-card`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary mb-2">
        <Mail size={13} /> Newsletter
      </div>
      <h3 className="font-serif text-xl font-semibold mb-1">Get the daily AI TL;DR in your inbox</h3>
      <p className="text-sm text-muted-foreground mb-4">One email a day. The five things that mattered. Nothing else.</p>
      <form onSubmit={submit} className="flex gap-2 max-w-md">
        <input data-testid="newsletter-email-input" type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
          className="flex-1 h-10 px-4 rounded-full bg-background border border-border text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
        <button data-testid="newsletter-submit-btn" type="submit" disabled={busy}
          className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity duration-150 disabled:opacity-50 focus:ring-2 focus:ring-ring focus:outline-none">
          {busy ? "..." : "Subscribe"}
        </button>
      </form>
    </div>
  );
};

export default Newsletter;
