const KEY = "pulseai_bookmarks";

export const getBookmarks = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
};

export const isBookmarked = (id) => getBookmarks().some((b) => b.id === id);

export const toggleBookmark = (story) => {
  const list = getBookmarks();
  const exists = list.some((b) => b.id === story.id);
  const next = exists ? list.filter((b) => b.id !== story.id) : [{ ...story, saved_at: Date.now() }, ...list];
  localStorage.setItem(KEY, JSON.stringify(next));
  return !exists;
};
