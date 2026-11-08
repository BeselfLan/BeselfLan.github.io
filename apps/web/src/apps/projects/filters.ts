// The filter chips of the Projects app and what each one lists (plan 5.2, D22).
//
// Every import here is `import type`: `os/apps/registry.ts` loads the app's
// `index.ts` into the page's first chunk, and `index.ts` imports this file, so
// a value import of the content package would grow that chunk (plan 8.3).
//
// Plan 5.2 lists these six chips, Featured first (D22). It has no chip for the
// `competition` kind, so competitions sit under Projects, as `bootGroups()`
// files them. Override: a seventh chip, { id: "competition", label:
// "Competitions" }, and a `competition` case in `entriesFor`.

import type { Entry } from "@beself/content";
import type { ContentProvider } from "@/content/provider";

export const FILTERS = [
  { id: "featured", label: "Featured" },
  { id: "all", label: "All" },
  { id: "project", label: "Projects" },
  { id: "hackathon", label: "Hackathons" },
  { id: "experience", label: "Experience" },
  { id: "volunteer", label: "Volunteer" },
] as const;

export type FilterId = (typeof FILTERS)[number]["id"];

/** The app opens on Featured (D22). */
export const DEFAULT_FILTER: FilterId = "featured";

export function isFilterId(value: unknown): value is FilterId {
  return FILTERS.some((f) => f.id === value);
}

/** The part of the provider this file reads. */
export type FilterSource = Pick<
  ContentProvider,
  "entries" | "entry" | "featuredEntries" | "entriesByKind"
>;

const byOrder = (a: Entry, b: Entry): number => a.order - b.order;

/**
 * The entries a chip lists, in `order`. The provider hands the same arrays to
 * every app, so a list is copied before it is sorted, never sorted in place.
 */
export function entriesFor(
  filter: FilterId,
  content: FilterSource,
): readonly Entry[] {
  switch (filter) {
    case "featured":
      return content.featuredEntries();
    case "all":
      return [...content.entries()].sort(byOrder);
    case "project": {
      const kinds = content.entriesByKind();
      return [...kinds.project, ...kinds.competition].sort(byOrder);
    }
    default:
      return content.entriesByKind()[filter];
  }
}

/** "1 item", otherwise "<n> items". */
export function countLabel(n: number): string {
  return n === 1 ? "1 item" : `${n} items`;
}

export interface ProjectsView {
  filter: FilterId;
  /** The entry to open in the panel, or null for none. */
  selectedId: string | null;
}

/**
 * The starting filter and selection for a window's args. An unknown filter
 * falls back to Featured, and an item that is not an entry is ignored. An item
 * that is not in the filter's list (a deep link to a non-featured entry, say)
 * switches the view to All, so the link lands with its panel open.
 *
 * It reads `args` only: they are frozen.
 */
export function viewFor(
  args: { item?: unknown; filter?: unknown },
  content: FilterSource,
): ProjectsView {
  let filter = isFilterId(args.filter) ? args.filter : DEFAULT_FILTER;
  if (typeof args.item !== "string") return { filter, selectedId: null };
  const entry = content.entry(args.item);
  if (!entry) return { filter, selectedId: null };
  if (!entriesFor(filter, content).some((e) => e.id === entry.id)) {
    filter = "all";
  }
  return { filter, selectedId: entry.id };
}
