import type { WindowState } from "../store/windows";

// The pure parts of the Alt+Tab switcher (plan 2.5, 4.7): which windows it
// lists, in what order, and where the selection goes. No React and no DOM, so
// the rules can be tested with plain objects.

/**
 * Every window, minimised ones included: the focused window first, then the
 * rest by z, highest first.
 *
 * The focused window is the open window with the highest z. A minimised window
 * keeps its z, so after the visitor minimises the front window a plain sort
 * would list that minimised window first. The first press selects the second
 * entry, which would then be the window that already has focus, and a quick
 * Alt+Tab would do nothing. With the focused window first, it brings back the
 * window that was just minimised. When the top window is open, both rules give
 * the same list. cycleFocus (#31) skips minimised windows, and a minimised
 * Video Player has no dock icon, so the switcher is its only way back.
 */
export function switcherOrder(items: readonly WindowState[]): WindowState[] {
  const byZ = [...items].sort((a, b) => b.z - a.z);
  const focused = byZ.find((w) => w.status === "open");
  return focused ? [focused, ...byZ.filter((w) => w !== focused)] : byZ;
}

/** Moves one step either way and wraps round. 0 for an empty list. */
export function nextIndex(i: number, count: number, dir: 1 | -1): number {
  return count <= 0 ? 0 : (((i + dir) % count) + count) % count;
}

/**
 * Where the first press lands. With a focused window at index 0 the first press
 * skips it (the next window, or the last one going backwards). With no focused
 * window, every one is minimised and none is current: it starts at the first
 * entry, or at the last going backwards.
 */
export function firstIndex(
  count: number,
  hasFocused: boolean,
  dir: 1 | -1,
): number {
  if (count <= 0) return 0;
  return hasFocused ? nextIndex(0, count, dir) : dir === 1 ? 0 : count - 1;
}
