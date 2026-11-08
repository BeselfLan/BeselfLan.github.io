"use client";

import { useSyncExternalStore } from "react";
import { useOS } from "../store";
import type { Settings } from "../store/settings";

// Reduced motion for the boot (plan 3.4, #14). One answer from the setting and
// the system query: "on" and "off" win, and "system" follows the browser. Both
// the mode choice (mode.ts) and the screens (BootScreens, Laptop) read it here.
// Nothing runs at import, and the hook's server snapshot is false, so the
// server HTML and the first client render agree.

export const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/** The setting decides; only "system" asks the browser. */
export function isReducedMotion(
  setting: Settings["reducedMotion"],
  systemReduces: boolean,
): boolean {
  if (setting === "on") return true;
  if (setting === "off") return false;
  return systemReduces;
}

const hasMatchMedia = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

/** True when the browser asks for less motion. False where it cannot be asked. */
export function systemReducesMotion(): boolean {
  return hasMatchMedia() && window.matchMedia(REDUCED_QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The flag the boot screens and the laptop use. False on the server. */
export function useBootReducedMotion(): boolean {
  const setting = useOS((s) => s.settings.reducedMotion);
  const system = useSyncExternalStore(
    subscribe,
    systemReducesMotion,
    () => false,
  );
  return isReducedMotion(setting, system);
}
