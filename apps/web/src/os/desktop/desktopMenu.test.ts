import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contextMenus } from "@/os/apps/extensions";
import { getApp } from "@/os/apps/registry";
import { os, useOS } from "@/os/store";
import { defaultSettings, SettingsSchema } from "@/os/store/settings";
import type { MenuItem } from "@/os/ui/Menu";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import {
  DISPLAY_NOTICE,
  desktopMenu,
  nextWallpaper,
  opensDesktopMenu,
} from "./desktopMenu";

// Extension items registered by a test come off in afterEach: the registry is
// module level.
const unregisters: (() => void)[] = [];

beforeEach(() => {
  setupBrowser();
});
afterEach(() => {
  for (const off of unregisters.splice(0)) off();
  teardownBrowser();
});

const state = () => useOS.getState();
const labels = (items: readonly MenuItem[]) =>
  items.map((i) => (i.separator ? "---" : i.label));
/** Runs the item with this id, as a click in the menu does. */
function choose(items: readonly MenuItem[], id: string): void {
  const item = items.find((i) => i.id === id);
  if (!item || item.separator) throw new Error(`no menu item "${id}"`);
  item.onSelect();
}
const withTerminal = (id: string) =>
  id === "terminal" ? ({ id: "terminal" } as never) : undefined;

describe("desktopMenu", () => {
  describe("items", () => {
    it("are the three of plan 4.5, with Terminal disabled for now", () => {
      const items = desktopMenu();
      expect(labels(items)).toEqual([
        "Change Background...",
        "Display Settings",
        "Open in Terminal",
      ]);
      // The real registry has no terminal app yet.
      expect(getApp("terminal")).toBeUndefined();
      expect(items.map((i) => !i.separator && i.disabled)).toEqual([
        undefined,
        undefined,
        true,
      ]);
    });

    it("enables Open in Terminal when the lookup has a terminal app", () => {
      const items = desktopMenu(withTerminal);
      const terminal = items[2];
      expect(terminal.separator).not.toBe(true);
      expect(!terminal.separator && terminal.disabled).toBe(false);

      const open = vi.spyOn(os.windows, "openApp").mockReturnValue("terminal");
      choose(items, "desktop:terminal");
      expect(open).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledWith("terminal");
    });

    it("are built fresh each time", () => {
      expect(desktopMenu()).not.toBe(desktopMenu());
    });
  });

  describe("Change Background...", () => {
    it("moves to the next wallpaper each time, and wraps round", () => {
      // The schema's own order, rotated by one: no list of ids lives here.
      const options = SettingsSchema.shape.wallpaper.unwrap().options;
      expect(options.length).toBeGreaterThan(1);
      expect(state().settings.wallpaper).toBe(defaultSettings.wallpaper);
      const start = options.indexOf(defaultSettings.wallpaper);

      for (let n = 1; n <= options.length; n++) {
        // A fresh menu each time: the choice reads the setting when chosen.
        choose(desktopMenu(), "desktop:background");
        expect(state().settings.wallpaper).toBe(
          options[(start + n) % options.length],
        );
      }
      // A full turn is back where it began.
      expect(state().settings.wallpaper).toBe(defaultSettings.wallpaper);
    });

    it("gives orange, mono, aubergine from the default", () => {
      const seen: string[] = [];
      for (let n = 0; n < 3; n++) {
        choose(desktopMenu(), "desktop:background");
        seen.push(state().settings.wallpaper);
      }
      expect(seen).toEqual(["orange", "mono", "aubergine"]);
    });

    it("reads the wallpaper when it is chosen, not when the menu is built", () => {
      const items = desktopMenu();
      os.settings.update({ wallpaper: "mono" });
      choose(items, "desktop:background");
      expect(state().settings.wallpaper).toBe("aubergine");
    });

    it("nextWallpaper follows the schema and wraps round", () => {
      const options = SettingsSchema.shape.wallpaper.unwrap().options;
      for (const [i, id] of options.entries()) {
        expect(nextWallpaper(id)).toBe(options[(i + 1) % options.length]);
      }
    });
  });

  describe("Display Settings", () => {
    it("pushes the notice and nothing else", () => {
      expect(DISPLAY_NOTICE).toEqual({
        title: "Display Settings",
        body: "Display settings are coming soon.",
      });
      choose(desktopMenu(), "desktop:display");
      const pushed = state().notifications.items;
      expect(pushed).toHaveLength(1);
      expect(pushed[0]).toMatchObject(DISPLAY_NOTICE);
      // The wallpaper did not move.
      expect(state().settings.wallpaper).toBe(defaultSettings.wallpaper);
    });

    it("can be chosen twice: the shared notice is not frozen by the store", () => {
      choose(desktopMenu(), "desktop:display");
      choose(desktopMenu(), "desktop:display");
      expect(state().notifications.items).toHaveLength(2);
      expect(Object.isFrozen(DISPLAY_NOTICE)).toBe(false);
    });
  });

  describe("items registered for desktop", () => {
    const item: MenuItem = {
      id: "ext:one",
      label: "Extra thing",
      onSelect: () => {},
    };

    it("come after a separator, and go with their unregister", () => {
      const off = contextMenus.register("desktop", [item]);
      unregisters.push(off);

      const items = desktopMenu();
      expect(labels(items)).toEqual([
        "Change Background...",
        "Display Settings",
        "Open in Terminal",
        "---",
        "Extra thing",
      ]);
      expect(items[3].separator).toBe(true);
      expect(items[4]).toBe(item);

      off();
      expect(labels(desktopMenu())).toEqual([
        "Change Background...",
        "Display Settings",
        "Open in Terminal",
      ]);
    });

    it("are not mixed with the dock icon's", () => {
      unregisters.push(contextMenus.register("dock-icon", [item]));
      expect(desktopMenu()).toHaveLength(3);
    });
  });
});

describe("opensDesktopMenu", () => {
  // A detached div stands in for the laptop's root, which is what Chromium
  // sends a keyboard `contextmenu` to (#158). jsdom has no PointerEvent, so
  // the decision takes plain fields.
  const desk = document.createElement("div");
  const windowContent = document.createElement("div");
  let focused: HTMLButtonElement;
  beforeEach(() => {
    focused = document.createElement("button");
    document.body.append(focused);
    focused.focus();
  });
  afterEach(() => focused.remove());

  const body = () => document.body;
  const onDesk = () => desk;
  const onWindow = () => windowContent;
  const nothing = () => null;
  const control = () => focused;
  type Row = [
    name: string,
    target: () => Element,
    button: number,
    pointerType: string | undefined,
    active: () => Element | null,
    defaultPrevented: boolean,
    opens: boolean,
  ];
  const rows: Row[] = [
    ["the body, as v2 handled it", body, 0, undefined, body, false, true],
    ["the body, already handled", body, 0, undefined, body, true, false],
    [
      "Chromium's key: no button, at another element",
      onDesk,
      -1,
      "mouse",
      body,
      false,
      true,
    ],
    [
      "a key with no pointer type and no active element",
      onDesk,
      -1,
      undefined,
      nothing,
      false,
      true,
    ],
    [
      "a key with a control focused: that control's own menu",
      onDesk,
      -1,
      "mouse",
      control,
      false,
      false,
    ],
    [
      "a key that a handler already took",
      onDesk,
      -1,
      "mouse",
      body,
      true,
      false,
    ],
    [
      "a mouse right-click outside the screen",
      onDesk,
      2,
      "mouse",
      body,
      false,
      false,
    ],
    [
      "a mouse right-click on a window",
      onWindow,
      2,
      "mouse",
      body,
      false,
      false,
    ],
    [
      "fireEvent's default button on a window",
      onWindow,
      0,
      undefined,
      body,
      false,
      false,
    ],
    ["no button from a touch", onDesk, -1, "touch", body, false, false],
    ["no button from a pen", onDesk, -1, "pen", body, false, false],
  ];

  it.each(rows)(
    "%s",
    (_name, target, button, pointerType, active, defaultPrevented, opens) => {
      expect(
        opensDesktopMenu(
          { target: target(), button, pointerType, defaultPrevented },
          active(),
        ),
      ).toBe(opens);
    },
  );
});
