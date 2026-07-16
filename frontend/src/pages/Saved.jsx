import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getBookmarks } from "@/lib/bookmarks";
import StoryCard from "@/components/StoryCard";

export default function Saved() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    document.title = "Saved — PulseAI";
    setItems(getBookmarks());
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-10">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight mb-8" data-testid="saved-title">Saved stories</h1>
      {items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg" data-testid="saved-empty-state">
          <p className="font-serif text-xl mb-2">Nothing saved yet</p>
          <p className="text-sm text-muted-foreground mb-4">Tap the bookmark icon on any story to keep it here. No account needed.</p>
          <Link to="/" className="text-primary text-sm hover:underline" data-testid="saved-browse-link">Browse the feed</Link>
        </div>
      ) : (
        <div className="space-y-3" data-testid="saved-list">
          {items.map((s, i) => <StoryCard key={s.id} story={s} rank={i + 1} />)}
        </div>
      )}
    </div>
  );
}
