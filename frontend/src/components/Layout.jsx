import { Link, Outlet, useLocation } from "react-router-dom";
import { Sun, Moon, Bookmark, Rss } from "lucide-react";
import Newsletter from "@/components/Newsletter";

export default function Layout({ theme, setTheme }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" data-testid="header-logo" className="flex items-center gap-2 group">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="font-serif font-bold text-xl tracking-tight">PulseAI</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link to="/saved" data-testid="nav-saved"
              className={`px-3 py-1.5 rounded-full transition-colors duration-150 hover:bg-secondary flex items-center gap-1.5 ${pathname === "/saved" ? "text-primary" : "text-muted-foreground"}`}>
              <Bookmark size={14} /> <span className="hidden sm:inline">Saved</span>
            </Link>
            <Link to="/about" data-testid="nav-about"
              className={`px-3 py-1.5 rounded-full transition-colors duration-150 hover:bg-secondary ${pathname === "/about" ? "text-primary" : "text-muted-foreground"}`}>
              About
            </Link>
            <a href={`${process.env.REACT_APP_BACKEND_URL}/api/rss.xml`} target="_blank" rel="noreferrer"
              data-testid="nav-rss" className="px-2 py-1.5 rounded-full text-muted-foreground hover:bg-secondary transition-colors duration-150">
              <Rss size={14} />
            </a>
            <button data-testid="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="ml-1 p-2 rounded-full border border-border hover:border-primary transition-colors duration-150 focus:ring-2 focus:ring-ring focus:outline-none"
              aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 relative z-10">
        <Outlet />
      </main>

      <footer className="border-t border-border/60 mt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-10">
          <Newsletter compact />
          <div className="flex flex-col sm:flex-row justify-between gap-4 text-xs text-muted-foreground">
            <p data-testid="footer-tagline">PulseAI — AI news, deduplicated and ranked. Updated every 20 minutes.</p>
            <div className="flex gap-4">
              <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
              <a href={`${process.env.REACT_APP_BACKEND_URL}/api/rss.xml`} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">RSS</a>
              <a href={`${process.env.REACT_APP_BACKEND_URL}/api/sitemap.xml`} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">Sitemap</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
