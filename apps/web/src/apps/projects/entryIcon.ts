import type { Entry } from "@beself/content";

// What an entry's icon is (plan 5.7, D17). A featured entry has a drawn SVG
// under public/icons/entries; every other entry gets a generated tile, its
// initials on a colour that comes from its id. No React here, so a node test
// can run it.

/** The fields of an entry that the icon and the item button read. */
export type EntryIconSource = Pick<Entry, "id" | "title" | "icon" | "featured">;

/**
 * 32-bit FNV-1a over the UTF-8 bytes of `text`. The published test vectors are
 * defined over bytes. The ids are ASCII, so this is also the char-code hash.
 */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Each colour gives white text at least 4.5:1 (plan 8.2). The brand orange
// #E95420 is left out: it is about 3.65:1 against white. Override: edit this
// list, in the order the test pins, and a colour will move for some entries.
export const TILE_COLOURS = [
  "#77216F",
  "#5E2750",
  "#B23A12",
  "#2C6E49",
  "#1F5F99",
  "#7A4E0E",
  "#4B5563",
  "#8E2D57",
] as const;

/** The tile colour of an entry. It depends on the id only, so it never changes. */
export function tileColour(id: string): string {
  return TILE_COLOURS[fnv1a(id) % TILE_COLOURS.length];
}

/**
 * The first character of each of the first two words, upper-cased. A word is a
 * run of letters and digits. "?" when there is no word.
 */
export function tileInitials(title: string): string {
  const words = title.match(/[\p{L}\p{N}]+/gu) ?? [];
  return (
    words
      .slice(0, 2)
      .map((word) => String.fromCodePoint(word.codePointAt(0)!).toUpperCase())
      .join("") || "?"
  );
}

/**
 * True when the entry has an SVG file of its own. Today that is exactly the
 * featured entries (plan 5.7, docs/CONTENT.md step 2). Override: an explicit
 * set of ids, once a non-featured entry gets a drawn icon; icons.test.ts then
 * fails first and says so.
 */
export function hasDrawnIcon(entry: Pick<Entry, "featured">): boolean {
  return entry.featured;
}
