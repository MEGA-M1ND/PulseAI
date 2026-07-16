import { useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { toast } from "sonner";
import { Play, Trash2, RefreshCw } from "lucide-react";
import api from "@/lib/api";
import { Switch } from "@/components/ui/switch";

dayjs.extend(relativeTime);

export default function Admin() {
  const [password, setPassword] = useState(() => sessionStorage.getItem("pulseai_admin") || "");
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState("");
  const [sources, setSources] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ name: "", url: "", ai_only: true });

  const headers = useCallback(() => ({ "X-Admin-Password": password }), [password]);

  const load = useCallback(async () => {
    const [s, st] = await Promise.all([
      api.get("/admin/sources", { headers: headers() }),
      api.get("/admin/stats", { headers: headers() }),
    ]);
    setSources(s.data.sources);
    setStats(st.data);
  }, [headers]);

  useEffect(() => {
    document.title = "Admin — PulseAI";
    if (password) {
      api.post("/admin/verify", { password }).then(() => { setAuthed(true); }).catch(() => sessionStorage.removeItem("pulseai_admin"));
    }
  }, [password]);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const login = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/verify", { password: input });
      sessionStorage.setItem("pulseai_admin", input);
      setPassword(input);
    } catch { toast.error("Wrong password"); }
  };

  const toggleSource = async (src) => {
    await api.patch(`/admin/sources/${src.id}`, { active: !src.active }, { headers: headers() });
    load();
  };

  const removeSource = async (id) => {
    await api.delete(`/admin/sources/${id}`, { headers: headers() });
    toast("Source removed");
    load();
  };

  const addSource = async (e) => {
    e.preventDefault();
    await api.post("/admin/sources", { ...form, type: "rss" }, { headers: headers() });
    toast.success("Source added");
    setForm({ name: "", url: "", ai_only: true });
    load();
  };

  const runIngest = async () => {
    await api.post("/admin/run", {}, { headers: headers() });
    toast.success("Ingestion started — refresh stats in a minute");
  };

  const runTldr = async () => {
    await api.post("/admin/tldr", {}, { headers: headers() });
    toast.success("TL;DR regeneration started");
  };

  if (!authed) return (
    <div className="max-w-sm mx-auto px-4 pt-24">
      <h1 className="font-serif text-2xl font-bold mb-6" data-testid="admin-login-title">Admin access</h1>
      <form onSubmit={login} className="space-y-3">
        <input type="password" data-testid="admin-password-input" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Password" className="w-full h-11 px-4 rounded-lg bg-card border border-border text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
        <button type="submit" data-testid="admin-login-btn"
          className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">Sign in</button>
      </form>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-10" data-testid="admin-dashboard">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-serif text-3xl font-bold tracking-tight">Sources</h1>
        <div className="flex gap-2">
          <button onClick={runTldr} data-testid="admin-run-tldr-btn" className="px-3 py-2 rounded-full border border-border text-xs hover:border-primary transition-colors flex items-center gap-1.5"><RefreshCw size={12} /> Regenerate TL;DR</button>
          <button onClick={runIngest} data-testid="admin-run-ingest-btn" className="px-3 py-2 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"><Play size={12} /> Run ingestion</button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8" data-testid="admin-stats">
          {[["Stories", stats.stories], ["Articles", stats.articles], ["Subscribers", stats.subscribers], ["Pending enrich", stats.pending_enrichment]].map(([label, val]) => (
            <div key={label} className="p-4 rounded-lg border border-border/60 bg-card">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-serif text-2xl font-bold">{val}</p>
            </div>
          ))}
          {stats.last_ingest && <p className="col-span-full text-xs text-muted-foreground">Last ingest {dayjs(stats.last_ingest.time).fromNow()} · {stats.last_ingest.new_items} new items</p>}
        </div>
      )}

      <div className="space-y-2 mb-10">
        {sources.map((src) => (
          <div key={src.id} data-testid={`admin-source-${src.id}`}
            className={`flex items-center gap-4 p-4 rounded-lg border border-border/60 bg-card ${!src.active ? "opacity-50" : ""}`}>
            <Switch checked={src.active} onCheckedChange={() => toggleSource(src)} data-testid={`source-toggle-${src.id}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{src.name}</p>
              <p className="text-xs text-muted-foreground truncate">{src.url}</p>
            </div>
            <div className="text-right text-xs shrink-0">
              <p className={src.last_status === "error" ? "text-destructive" : "text-primary"}>{src.last_status}</p>
              <p className="text-muted-foreground">{src.items_pulled} items · {src.error_count} errors</p>
              {src.last_fetch && <p className="text-muted-foreground">{dayjs(src.last_fetch).fromNow()}</p>}
            </div>
            <button onClick={() => removeSource(src.id)} data-testid={`source-delete-${src.id}`}
              className="p-2 rounded-full text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <form onSubmit={addSource} className="p-5 rounded-lg border border-border/60 bg-card space-y-3" data-testid="admin-add-source-form">
        <h2 className="font-serif text-lg font-semibold">Add RSS source</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input required placeholder="Name" data-testid="add-source-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-10 px-4 rounded-lg bg-background border border-border text-sm flex-1 focus:ring-2 focus:ring-ring focus:outline-none" />
          <input required placeholder="Feed URL" data-testid="add-source-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="h-10 px-4 rounded-lg bg-background border border-border text-sm flex-[2] focus:ring-2 focus:ring-ring focus:outline-none" />
          <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <Switch checked={form.ai_only} onCheckedChange={(v) => setForm({ ...form, ai_only: v })} data-testid="add-source-aionly" /> AI-only
          </label>
          <button type="submit" data-testid="add-source-submit" className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">Add</button>
        </div>
      </form>
    </div>
  );
}
