import { contextMenus } from "../apps/extensions";
import type { AnyAppDefinition } from "../apps/types";
import {
  focusedWindow,
  isAppRunning,
  os,
  useOS,
  windowsForApp,
} from "../store";
import type { WindowManagerState } from "../store/windows";
import type { MenuItem } from "../ui/Menu";

// The dock's rules (plan 4.3), as plain functions of the store state. The
// component only reads and calls them, so a test needs no DOM.

/** What the dock needs from an app: a test passes plain literals. */
export type DockApp = Pick<
  AnyAppDefinition,
  "id" | "name" | "icon" | "dock" | "singleton" | "defaultArgs"
>;

/** The part of the store these functions read: `useOS.getState()` fits. */
type DockState = { windows: WindowManagerState };

export type DockAction =
  | { kind: "open" }
  | { kind: "focus"; id: string }
  | { kind: "minimize"; ids: string[] }
  | { kind: "restore"; ids: string[] };

// Section 6 words this. Pinning is not a setting yet, so Unpin only says so.
// The notice lands in the calendar's list, which reads the same store as the
// toasts.
export const UNPIN_NOTICE = {
  title: "Unpin",
  body: "Unpinning apps is coming soon.",
} as const;

/**
 * The apps the dock draws, in `list`'s order and as the same objects. A pinned
 * app always shows. An unpinned one shows while it has a window, minimised
 * included. An app with no dock entry never shows.
 */
export function dockEntries<T extends DockApp>(
  state: DockState,
  list: readonly T[],
): T[] {
  return list.filter(
    (app) =>
      app.dock !== null && (app.dock.pinned || isAppRunning(state, app.id)),
  );
}

/**
 * What a left click on an app's icon does (GNOME's rules, applied to all of the
 * app's windows). If the app owns the focused window, minimise its open
 * windows. Otherwise, if it has an open window, focus the highest one.
 * Otherwise, if it has windows, all minimised, restore them lowest z first, so
 * the highest ends on top. Otherwise open it.
 */
export function dockClick(state: DockState, appId: string): DockAction {
  const windows = windowsForApp(state, appId).sort((a, b) => a.z - b.z);
  if (windows.length === 0) return { kind: "open" };
  const open = windows.filter((w) => w.status === "open");
  if (focusedWindow(state)?.appId === appId) {
    return { kind: "minimize", ids: open.map((w) => w.id) };
  }
  if (open.length > 0) return { kind: "focus", id: open[open.length - 1].id };
  return { kind: "restore", ids: windows.map((w) => w.id) };
}

/** Runs `dockClick`'s answer through the window actions. */
export function applyDockClick(appId: string): void {
  const action = dockClick(useOS.getState(), appId);
  switch (action.kind) {
    case "open":
      os.windows.openApp(appId);
      break;
    case "focus":
      os.windows.focusWindow(action.id);
      break;
    case "minimize":
      for (const id of action.ids) os.windows.minimizeWindow(id);
      break;
    case "restore":
      for (const id of action.ids) os.windows.restoreWindow(id);
      break;
  }
}

/**
 * The right-click menu of one icon: New Window for an app that can have
 * several, Unpin for a pinned one, Quit last while it has a window, then the
 * items apps registered for "dock-icon" after a separator. Build it when the
 * menu opens: the registry is read here, and Quit reads the windows when it is
 * chosen.
 */
export function dockMenu(state: DockState, app: DockApp): MenuItem[] {
  const items: MenuItem[] = [];
  if (!app.singleton) {
    items.push({
      id: "dock:new-window",
      label: "New Window",
      // openApp throws for a multi-instance app that has no default args.
      disabled: app.defaultArgs === undefined,
      onSelect: () => {
        os.windows.openApp(app.id);
      },
    });
  }
  if (app.dock?.pinned) {
    items.push({
      id: "dock:unpin",
      label: "Unpin",
      onSelect: () => {
        os.notifications.push({ ...UNPIN_NOTICE });
      },
    });
  }
  if (isAppRunning(state, app.id)) {
    items.push({
      id: "dock:quit",
      label: "Quit",
      onSelect: () => {
        for (const w of windowsForApp(useOS.getState(), app.id)) {
          void os.windows.closeWindow(w.id);
        }
      },
    });
  }
  const extra = contextMenus.list("dock-icon");
  if (extra.length > 0) {
    items.push({ id: "dock:extensions", separator: true }, ...extra);
  }
  return items;
}
