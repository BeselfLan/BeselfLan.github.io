"use client";

import { useEffect } from "react";
import { showsDesktop } from "../boot/BootSequence";
import { installShortcuts } from "../input/shortcuts";
import { os, useOS } from "../store";
import { applyDeepLink, startUrlSync } from "./deepLink";
import { appLookup } from "./registry";

/**
 * What the page runs once so the OS works: the app lookup, the deep link in
 * the URL, the URL sync and the keyboard. Call it from page.tsx only.
 */
export function useKernel(): void {
  // A plain effect, not a layout effect: Screen's layout effects set the work
  // area first, so a window opened by the link is placed in the real one (#32).
  // The lookup comes before the link, because openApp needs it (#31). The URL
  // is read here and not with useSearchParams, which a static export would
  // wrap in Suspense, so the server HTML stays the boot screen (plan 9).
  useEffect(() => {
    os.windows.setAppLookup(appLookup);
    applyDeepLink(window.location.search);
    return startUrlSync();
  }, []);

  // The keyboard works while the desktop shows (#64). One install, with the
  // uninstall as the cleanup: Strict Mode's install, uninstall, install is
  // fine, and two installs at once would handle every key twice.
  const desktop = useOS((s) => showsDesktop(s.boot.stage));
  useEffect(() => (desktop ? installShortcuts() : undefined), [desktop]);
}
