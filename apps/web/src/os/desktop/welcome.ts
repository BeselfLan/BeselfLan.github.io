import { useEffect } from "react";
import { dockApps } from "../apps/registry";
import { os, useOS } from "../store";
import type { ScreenMode } from "../store/windows";

// The welcome notice (#101, call 1). An empty desktop gives no hint where to
// start, so the first time in a browser session that the desktop comes up with
// no window open, one notification points at the dock. It shows as a toast and
// stays in the calendar's list.
//
// Any boot mode greets. Since #14, phones, reduced motion, same-tab reloads and
// ?boot=skip all land on an empty desktop with a fast or skipped boot, and a
// rule that waited for a full boot would never greet them. A deep link opens
// its window before the boot reaches the desktop, so a visitor who already has
// an app in front of them gets nothing. The flag is its own key, separate from
// the boot's `beselfos:booted`.

export const WELCOMED_KEY = "beselfos:welcomed";
export const WELCOME_TITLE = "Welcome to BeselfOS";

/**
 * "Open A, B or C from the dock on the left." On a phone the dock is at the
 * bottom (D4), and the sentence says so. One name gives "Open A", two give
 * "Open A or B", with no comma before "or".
 */
export function welcomeBody(
  names: readonly string[],
  mode: ScreenMode,
): string {
  const list =
    names.length === 0
      ? "an app"
      : names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  const where = mode === "fullscreen" ? "at the bottom" : "on the left";
  return `Open ${list} from the dock ${where}.`;
}

// Used only when storage throws, as it can in some private modes: the welcome
// then shows once per page load. It is read and written nowhere else, so while
// storage works nothing carries over between remounts of the desktop.
let welcomedInMemory = false;

function isWelcomed(): boolean {
  try {
    return sessionStorage.getItem(WELCOMED_KEY) === "1";
  } catch {
    return welcomedInMemory;
  }
}

function markWelcomed(): void {
  try {
    sessionStorage.setItem(WELCOMED_KEY, "1");
  } catch {
    welcomedInMemory = true;
  }
}

function maybeWelcome(): void {
  const state = useOS.getState();
  // A desktop with a window open is not empty, and costs the visitor no flag:
  // a later empty arrival in this session still greets them.
  if (state.windows.items.length > 0 || isWelcomed()) return;
  // The flag first, so that Strict Mode's second effect run sees it.
  markWelcomed();
  const names = dockApps.filter((a) => a.dock?.pinned).map((a) => a.name);
  os.notifications.push({
    title: WELCOME_TITLE,
    body: welcomeBody(names, state.windows.mode),
  });
}

/**
 * Pushes the welcome when the boot reaches the desktop, if the session has not
 * been welcomed and no window is open. The push is a store action, and all
 * storage access is in the effect, so rendering stays pure.
 */
export function useWelcome(): void {
  const stage = useOS((s) => s.boot.stage);
  useEffect(() => {
    if (stage === "desktop") maybeWelcome();
  }, [stage]);
}
