import { contextMenus } from "../apps/extensions";
import type { AppLookup } from "../apps/AppHost";
import { getApp } from "../apps/registry";
import { os, useOS } from "../store";
import { SettingsSchema, type Settings } from "../store/settings";
import type { MenuItem } from "../ui/Menu";

// The right-click menu of the bare desktop (plan 4.5), as a plain function, so
// a test needs no DOM.

// Section 6 words this. There is no display setting yet, so the item only says
// so. The notice lands in the calendar's list, which reads the same store as
// the toasts.
export const DISPLAY_NOTICE = {
  title: "Display Settings",
  body: "Display settings are coming soon.",
} as const;

// From the schema, so a wallpaper added there joins the cycle with no edit here.
const WALLPAPERS = SettingsSchema.shape.wallpaper.unwrap().options;

/** The wallpaper after `current` in the schema's order, wrapping round. */
export function nextWallpaper(current: Settings["wallpaper"]) {
  const at = WALLPAPERS.indexOf(current);
  return WALLPAPERS[(at + 1) % WALLPAPERS.length];
}

/**
 * Change Background... (it moves to the next wallpaper; there is no picker
 * yet), Display Settings, and Open in Terminal, which stays disabled until an
 * app with the id "terminal" exists. Then the items apps registered for
 * "desktop", after a separator.
 *
 * Build it when the menu opens, never ahead: the registry is read here, and
 * Change Background... reads the current wallpaper when it is chosen.
 */
export function desktopMenu(lookup: AppLookup = getApp): MenuItem[] {
  const items: MenuItem[] = [
    {
      id: "desktop:background",
      label: "Change Background...",
      onSelect: () => {
        os.settings.update({
          wallpaper: nextWallpaper(useOS.getState().settings.wallpaper),
        });
      },
    },
    {
      id: "desktop:display",
      label: "Display Settings",
      onSelect: () => {
        // A copy: the store freezes what it keeps, and the constant is shared.
        os.notifications.push({ ...DISPLAY_NOTICE });
      },
    },
    {
      id: "desktop:terminal",
      label: "Open in Terminal",
      disabled: lookup("terminal") === undefined,
      onSelect: () => {
        os.windows.openApp("terminal");
      },
    },
  ];
  const extra = contextMenus.list("desktop");
  if (extra.length > 0) {
    items.push({ id: "desktop:extensions", separator: true }, ...extra);
  }
  return items;
}
