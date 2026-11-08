import { useOS } from "../store";
import type { Settings } from "../store/settings";
import { isReducedMotion, REDUCED_QUERY } from "./reducedMotion";
import type { BootMode } from "./stages";

// The one place that chooses how `/` boots (plan 3.4, D15, D16). The first
// rule that holds wins:
//   1. `?boot=full|fast|skip` forces that mode. Any other value is ignored.
//   2. The boot is fast after a deep link (`?app=` with a value), with reduced
//      motion, on a phone-sized screen (D4), once the session flag is set
//      (a reload in the same tab), or when `settings.bootMode` is "fast".
//   3. Otherwise it is the full boot.
// BootSequence calls initialMode() from its mount effect, never during render,
// so it may read the browser. It reads `window.location.search`, not
// `useSearchParams`, so the page needs no Suspense boundary and the static
// export stays whole.

/** The session flag: set when a boot reaches the desktop, read by the next load. */
export const BOOTED_KEY = "beselfos:booted";

// A copy of the query in Screen.tsx, which does not export it. mode.test.ts
// reads that file and fails if the two drift apart. The store's screen mode is
// no use here: during hydration it still says "laptop" on a phone.
export const FULLSCREEN_QUERY =
  "(max-width: 899.98px), (pointer: coarse) and (orientation: portrait)";

export interface ModeInputs {
  /** `window.location.search`, with or without the leading "?". */
  search: string;
  /** The session flag is set. */
  booted: boolean;
  /** Reduced motion, from the setting and the system together. */
  reducedMotion: boolean;
  /** The fullscreen (phone) query matches. */
  fullscreen: boolean;
  bootMode: Settings["bootMode"];
}

/** Pure: the same inputs always give the same mode. */
export function chooseMode(inputs: ModeInputs): BootMode {
  const params = new URLSearchParams(inputs.search);
  const forced = params.get("boot");
  if (forced === "full" || forced === "fast" || forced === "skip") {
    return forced;
  }
  const deepLink = (params.get("app") ?? "") !== "";
  if (
    deepLink ||
    inputs.reducedMotion ||
    inputs.fullscreen ||
    inputs.booted ||
    inputs.bootMode === "fast"
  ) {
    return "fast";
  }
  return "full";
}

function matches(query: string): boolean {
  try {
    return typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;
  } catch {
    return false;
  }
}

function readBooted(): boolean {
  try {
    return window.sessionStorage.getItem(BOOTED_KEY) === "1";
  } catch {
    // Storage blocked: every load is a full boot.
    return false;
  }
}

/** Reads the browser and the store. Call it from an effect, once per page load. */
export function initialMode(): BootMode {
  const { settings } = useOS.getState();
  return chooseMode({
    search: window.location.search,
    booted: readBooted(),
    reducedMotion: isReducedMotion(
      settings.reducedMotion,
      matches(REDUCED_QUERY),
    ),
    fullscreen: matches(FULLSCREEN_QUERY),
    bootMode: settings.bootMode,
  });
}

/** Writes the session flag. Every kind of boot writes it on reaching the desktop. */
export function markBooted(): void {
  try {
    window.sessionStorage.setItem(BOOTED_KEY, "1");
  } catch {
    // Storage blocked: the next load is a full boot.
  }
}
