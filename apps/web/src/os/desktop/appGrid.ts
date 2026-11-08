// The App Grid's rules (plan 4.4), as plain functions. The component only reads
// and calls them, so a test needs no DOM.

/** The id of the grid's root. Activities and Show Applications control it. */
export const APP_GRID_ID = "desktop-app-grid";

/**
 * The apps whose name matches `query`, in `list`'s order. The query is trimmed
 * and compared without case. Like GNOME's grid it matches the start of a word:
 * "ski" finds Skills and "pla" finds Video Player, but "ell" does not find
 * Hello. Several words must each start some word of the name, so "vid pla"
 * finds Video Player. An empty query matches every app.
 */
export function filterApps<T extends { name: string }>(
  list: readonly T[],
  query: string,
): T[] {
  const wanted = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (wanted.length === 0) return [...list];
  return list.filter((app) => {
    const words = app.name.toLowerCase().split(/\s+/);
    return wanted.every((w) => words.some((word) => word.startsWith(w)));
  });
}
