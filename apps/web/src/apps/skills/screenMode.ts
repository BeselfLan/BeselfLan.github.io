"use client";

import { useSyncExternalStore } from "react";

// The fullscreen query of os/screen/Screen.tsx (D4). It is copied because
// Screen's useScreenMode() calls window.matchMedia without a guard, and jsdom
// has none: the lead's registry.test.ts renders this app there. The test in
// screenMode.test.ts fails if the two strings differ. Once the lead guards
// useScreenMode(), this file can go and the app can call that instead.
export const FULLSCREEN_QUERY =
  "(max-width: 899.98px), (pointer: coarse) and (orientation: portrait)";

const hasMatchMedia = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const query = window.matchMedia(FULLSCREEN_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getSnapshot = (): boolean =>
  hasMatchMedia() && window.matchMedia(FULLSCREEN_QUERY).matches;

/** True in the fullscreen mode (D4). False on the server and without matchMedia. */
export function useFullscreen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
