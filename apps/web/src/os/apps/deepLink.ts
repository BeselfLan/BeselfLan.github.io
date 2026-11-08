import { focusedWindow, os, useOS, type OSState } from "../store";
import type { AppLookup } from "./AppHost";
import { getApp } from "./registry";

// Deep links (D16, plan 2.4): `?app=<id>` opens an app on load, and the
// focused window is written back to the URL. Nothing here reads `window` at
// import, so the server build can load the file. The page passes no lookup;
// tests pass their own.

export interface DeepLink {
  appId: string;
  args: unknown;
}

/**
 * The app and args a URL asks for, or null. It checks the id and the
 * `deepLink` before anything calls `openApp`, which throws on an unknown id.
 * An app without `deepLink` cannot be opened this way, and a `parse` that
 * returns null ignores the link.
 */
export function parseDeepLink(
  search: string | URLSearchParams,
  lookup: AppLookup = getApp,
): DeepLink | null {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const appId = params.get("app");
  if (!appId) return null;
  const link = lookup(appId)?.deepLink;
  if (!link) return null;
  const args = link.parse(params);
  return args === null ? null : { appId, args };
}

/**
 * Opens what the URL asks for and returns the window id, or null. It never
 * throws and logs nothing: a bad link is ignored, and the e2e specs fail on
 * any console error.
 */
export function applyDeepLink(
  search: string,
  lookup: AppLookup = getApp,
): string | null {
  try {
    const link = parseDeepLink(search, lookup);
    return link ? os.windows.openApp(link.appId, link.args) : null;
  } catch {
    return null;
  }
}

/**
 * The URL for a state: the focused window's app and its `format(args)` when
 * the app has a `deepLink`, else the bare path. Other params, such as `boot`,
 * are dropped.
 */
export function urlFor(
  state: OSState,
  pathname: string,
  lookup: AppLookup = getApp,
): string {
  const win = focusedWindow(state);
  const link = win ? lookup(win.appId)?.deepLink : undefined;
  if (!win || !link) return pathname;
  try {
    const query = new URLSearchParams({
      app: win.appId,
      ...link.format(win.args),
    });
    // An app cannot take over `app`; set keeps its place first.
    query.set("app", win.appId);
    return `${pathname}?${query}`;
  } catch {
    // A format that throws must not break the store subscription.
    return pathname;
  }
}

/**
 * Keeps the URL on the focused window with `history.replaceState`, never
 * `pushState`: a deep link is not a history entry. It writes only when the
 * wanted URL changes (a different focused window, or its args), never at
 * start, and returns the unsubscribe.
 */
export function startUrlSync(lookup: AppLookup = getApp): () => void {
  let last = urlFor(useOS.getState(), window.location.pathname, lookup);
  return useOS.subscribe((state) => {
    const next = urlFor(state, window.location.pathname, lookup);
    if (next === last) return;
    last = next;
    // Next's App Router wraps replaceState and wants null for the state.
    window.history.replaceState(null, "", next);
  });
}
