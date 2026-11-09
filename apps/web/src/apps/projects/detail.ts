// What the detail panel shows and how it words it (plan 5.4, D22). Pure: this
// file has only type imports, so a unit test needs no DOM and the content
// package stays out of any chunk that imports it.

import type { Entry, EntryKind, EntryPeriod } from "@beself/content";

/** The panel's width, in screen units (plan 5.2). */
export const PANEL_WIDTH = 380;

/**
 * How far the ring moves right while the panel is open. Half the panel's
 * width centres the ring in the 660 units to the right of the panel, and keeps
 * the front item fully clear of it.
 */
export const PANEL_SHIFT = PANEL_WIDTH / 2;

/** The kind chip's text. */
export const KIND_LABELS: Readonly<Record<EntryKind, string>> = {
  project: "Project",
  hackathon: "Hackathon",
  experience: "Experience",
  volunteer: "Volunteer",
  competition: "Competition",
};

/**
 * The years of an entry: only years, never months. One year (or the same year
 * twice) is "2024", a range is "2023–2024" (an en dash), an open end is
 * "2026–present". An unknown start gives null, and the panel leaves the line
 * out.
 */
export function periodLabel(period: EntryPeriod): string | null {
  if (period.start === "unknown") return null;
  const from = period.start.slice(0, 4);
  if (period.end === undefined) return from;
  if (period.end === "present") return `${from}–present`;
  const to = period.end.slice(0, 4);
  return to === from ? from : `${from}–${to}`;
}

export interface EntryLink {
  label: "GitHub" | "Website" | "Live demo";
  href: string;
}

/** The links an entry has, always in the order GitHub, Website, Live demo. */
export function entryLinks(links: Entry["links"]): EntryLink[] {
  const out: EntryLink[] = [];
  if (links.github) out.push({ label: "GitHub", href: links.github });
  if (links.site) out.push({ label: "Website", href: links.site });
  if (links.demo) out.push({ label: "Live demo", href: links.demo });
  return out;
}
