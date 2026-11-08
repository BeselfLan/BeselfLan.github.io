import type { Period } from "@beself/content";

// Pure helpers for the About app: no React, no clock. They only reshape what
// the content package already says, and add no claim of their own.

/**
 * The first letters of the first and last words, uppercased: "Beself Lan" is
 * "BL". One word gives one letter, and nothing gives "?".
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = [...words[0]][0];
  const last = words.length > 1 ? [...words[words.length - 1]][0] : "";
  return (first + last).toUpperCase();
}

/** The last non-empty path segment of a profile URL: the handle on GitHub. */
export function handleOf(url: string): string {
  try {
    const { pathname, hostname } = new URL(url);
    return pathname.split("/").filter(Boolean).at(-1) ?? hostname;
  } catch {
    return url.split("/").filter(Boolean).at(-1) ?? url;
  }
}

/** A link as it reads on a card: no protocol and no trailing slash. */
export function bareUrl(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/+$/, "");
}

/**
 * "2024–2029", or "Since 2014" while it is current or has no end, or one year
 * when it starts and ends in the same year. Only the year part is read, so a
 * month is never printed.
 */
export function period({ start, end }: Period): string {
  const from = start.slice(0, 4);
  if (end === undefined || end === "present") return `Since ${from}`;
  const to = end.slice(0, 4);
  return from === to ? from : `${from}–${to}`;
}
