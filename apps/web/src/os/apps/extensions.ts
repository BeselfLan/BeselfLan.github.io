import type { ReactNode } from "react";
import { os } from "../store";
import type { MenuItem } from "../ui/Menu";

export {
  shortcuts,
  type Shortcut,
  type ShortcutScope,
} from "../input/shortcuts";

// The 4.7 extension points: how an app adds to the shell without editing a
// shell component. Plan 4.7 lists them under "(os/desktop)", but that folder
// belongs to shell-desktop and `lead` may write only Desktop.tsx there, so they
// live here, next to the other things apps plug into. Override: move this file
// to os/desktop/ and add it to `lead` in docs/OWNERSHIP.json; only imports
// change.
//
// Each registry has list() and subscribe(cb) for useSyncExternalStore. list()
// returns the same array until something changes, or React would loop. The
// registries keep what callers pass and do not freeze it: callers must not
// mutate items after passing them.

export type ContextMenuTarget = "desktop" | "dock-icon" | "window-title";

export interface TrayItem {
  id: string;
  label: string;
  /** Left to right, lowest first; missing is 0. Ties keep registration order. */
  order?: number;
  render(): ReactNode;
}

/** A small change feed shared by one registry's lists. */
function createFeed() {
  const listeners = new Set<() => void>();
  return {
    subscribe(cb: () => void): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    emit(): void {
      // Copied: a callback may unsubscribe while we notify.
      for (const cb of [...listeners]) cb();
    },
  };
}

// --- Context menus --------------------------------------------------------

interface MenuGroup {
  items: readonly MenuItem[];
}

const EMPTY_MENU: readonly MenuItem[] = [];
const menuGroups = new Map<ContextMenuTarget, MenuGroup[]>();
const menuLists = new Map<ContextMenuTarget, readonly MenuItem[]>();
const menuFeed = createFeed();

// Groups in registration order with a separator between them, none at either
// end. An empty group adds nothing, so it adds no separator.
function buildMenu(
  target: ContextMenuTarget,
  groups: readonly MenuGroup[],
): readonly MenuItem[] {
  const out: MenuItem[] = [];
  let separators = 0;
  for (const group of groups) {
    if (group.items.length === 0) continue;
    if (out.length > 0) {
      out.push({ id: `${target}:separator:${++separators}`, separator: true });
    }
    out.push(...group.items);
  }
  return out.length === 0 ? EMPTY_MENU : out;
}

function setMenuGroups(target: ContextMenuTarget, groups: MenuGroup[]): void {
  menuGroups.set(target, groups);
  menuLists.set(target, buildMenu(target, groups));
  menuFeed.emit();
}

export const contextMenus = {
  /** Adds a group of items to a target's menu. Returns the unregister. */
  register(target: ContextMenuTarget, items: readonly MenuItem[]): () => void {
    const group: MenuGroup = { items };
    setMenuGroups(target, [...(menuGroups.get(target) ?? []), group]);
    return () => {
      const now = menuGroups.get(target);
      if (!now?.includes(group)) return;
      setMenuGroups(
        target,
        now.filter((g) => g !== group),
      );
    };
  },
  /** Groups in registration order, a separator item between groups. */
  list(target: ContextMenuTarget): readonly MenuItem[] {
    return menuLists.get(target) ?? EMPTY_MENU;
  },
  subscribe: menuFeed.subscribe,
};

// --- Top bar tray ---------------------------------------------------------

interface TrayEntry {
  item: TrayItem;
}

const EMPTY_TRAY: readonly TrayItem[] = [];
let trayEntries: TrayEntry[] = [];
let trayList: readonly TrayItem[] = EMPTY_TRAY;
const trayFeed = createFeed();

function setTray(entries: TrayEntry[]): void {
  trayEntries = entries;
  // Array.prototype.sort is stable, so ties keep registration order.
  trayList =
    entries.length === 0
      ? EMPTY_TRAY
      : entries
          .map((e) => e.item)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  trayFeed.emit();
}

export const topBar = {
  /** Throws on an id that is already registered. Returns the unregister. */
  registerTrayItem(item: TrayItem): () => void {
    if (trayEntries.some((e) => e.item.id === item.id)) {
      throw new Error(`tray item "${item.id}" is already registered`);
    }
    const entry: TrayEntry = { item };
    setTray([...trayEntries, entry]);
    return () => {
      if (!trayEntries.includes(entry)) return;
      setTray(trayEntries.filter((e) => e !== entry));
    };
  },
  /** By order (missing is 0), ties in registration order. */
  listTrayItems(): readonly TrayItem[] {
    return trayList;
  },
  subscribe: trayFeed.subscribe,
};

// --- Notifications --------------------------------------------------------

export const notifications = {
  /** Adds a notification and returns its id. Call from client effects only. */
  push(n: { title: string; body?: string; icon?: string }): string {
    return os.notifications.push(n);
  },
};
