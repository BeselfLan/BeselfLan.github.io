import { content } from "@beself/content";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { media } from "@/media/provider";
import { createAppApi } from "@/os/apps/appApi";
import { installShortcuts } from "@/os/input/shortcuts";
import { focusedWindow, os, useOS } from "@/os/store";
import type { WindowApp } from "@/os/store/windows";

const apps = new Map<string, WindowApp>();
const def = (id: string, over: Partial<WindowApp> = {}): WindowApp => ({
  id,
  name: `${id} name`,
  window: { width: 400, height: 300 },
  capabilities: { maximize: false },
  singleton: true,
  ...over,
});
const register = (...defs: WindowApp[]) =>
  defs.forEach((d) => apps.set(d.id, d));

// The part of a definition the api reads: its window.
const framed = {
  window: { width: 400, height: 300, resizable: false },
} as const;
const frameless = {
  window: { width: 400, height: 300, resizable: false, chrome: "none" },
} as const;

const api = (id: string, app: Parameters<typeof createAppApi>[1] = framed) =>
  createAppApi(id, app);
const win = (id: string) => {
  const found = useOS.getState().windows.items.find((w) => w.id === id);
  if (!found) throw new Error(`no window ${id}`);
  return found;
};
const has = (id: string) =>
  useOS.getState().windows.items.some((w) => w.id === id);

let uninstall: (() => void) | null;
let cleanups: (() => void)[];

beforeEach(() => {
  apps.clear();
  localStorage.clear();
  useOS.setState(useOS.getInitialState(), true);
  os.windows.setAppLookup((id) => apps.get(id));
  uninstall = null;
  cleanups = [];
});
afterEach(() => {
  uninstall?.();
  cleanups.forEach((off) => off());
  vi.restoreAllMocks();
});

describe("createAppApi", () => {
  it("has exactly the 4.1 members", () => {
    expect(Object.keys(api("a")).sort()).toEqual([
      "bounds",
      "close",
      "content",
      "focus",
      "isVisible",
      "media",
      "minimize",
      "notify",
      "openApp",
      "registerShortcut",
      "setTitle",
      "subscribeVisible",
    ]);
  });

  it("each action reaches its own window only", () => {
    register(def("a"), def("b"));
    os.windows.openApp("a");
    os.windows.openApp("b");
    const b = win("b");

    api("a").setTitle("Renamed");
    expect(win("a").title).toBe("Renamed");
    expect(win("b")).toBe(b);

    api("a").minimize();
    expect(win("a").status).toBe("minimized");
    expect(win("b")).toBe(b);

    os.windows.restoreWindow("a");
    os.windows.focusWindow("b");
    const raisedB = win("b");
    api("a").focus();
    expect(focusedWindow(useOS.getState())?.id).toBe("a");
    expect(win("b")).toBe(raisedB);

    api("a").close();
    expect(has("a")).toBe(false);
    expect(win("b")).toBe(raisedB);
  });

  it("focus raises an open window and leaves a minimised one minimised", () => {
    register(def("a"), def("b"));
    os.windows.openApp("a");
    os.windows.openApp("b");
    os.windows.minimizeWindow("a");
    api("a").focus();
    expect(win("a").status).toBe("minimized");
  });

  it("`openApp` returns the window id", () => {
    register(
      def("viewer", {
        singleton: false,
        instanceKey: (a) => (a as { k: string }).k,
      }),
    );
    expect(api("a").openApp("viewer", { k: "x" })).toBe("viewer:x");
    expect(has("viewer:x")).toBe(true);
    expect(() => api("a").openApp("missing")).toThrow(/missing/);
  });

  it("`notify` pushes a notification", () => {
    api("a").notify({ title: "Saved", body: "All done" });
    const items = useOS.getState().notifications.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "Saved", body: "All done" });
  });

  it("visibility follows minimise", () => {
    register(def("a"));
    os.windows.openApp("a");
    const a = api("a");
    const cb = vi.fn();
    cleanups.push(a.subscribeVisible(cb));
    expect(a.isVisible()).toBe(true);

    os.windows.moveWindow("a", { x: 300, y: 150 });
    expect(cb).not.toHaveBeenCalled();

    os.windows.minimizeWindow("a");
    expect(a.isVisible()).toBe(false);
    expect(cb.mock.calls).toEqual([[false]]);
  });

  it("the subscription stops at its unsubscribe", () => {
    register(def("a"));
    os.windows.openApp("a");
    const cb = vi.fn();
    api("a").subscribeVisible(cb)();
    os.windows.minimizeWindow("a");
    expect(cb).not.toHaveBeenCalled();
  });

  describe("bounds()", () => {
    it("is the content area, in screen units", () => {
      register(def("a", { capabilities: { maximize: true } }));
      os.windows.openApp("a");
      const a = api("a");
      // A 40 px title bar comes off the height.
      expect(a.bounds()).toEqual({ width: 400, height: 260 });

      os.windows.toggleMaximize("a");
      const area = useOS.getState().windows.workArea;
      expect(a.bounds()).toEqual({ width: area.w, height: area.h - 40 });
      expect(a.bounds()).toEqual({ width: 1376, height: 828 });

      os.windows.toggleMaximize("a");
      expect(a.bounds()).toEqual({ width: 400, height: 260 });
    });

    it("keeps the whole window when the app has no chrome", () => {
      register(def("a"));
      os.windows.openApp("a");
      expect(api("a", frameless).bounds()).toEqual({ width: 400, height: 300 });
    });

    it("falls back to the definition's size once the window is gone", () => {
      register(def("a"));
      os.windows.openApp("a");
      const a = api("a");
      void os.windows.closeWindow("a");
      expect(has("a")).toBe(false);
      expect(a.bounds()).toEqual({ width: 400, height: 260 });
    });

    it("is never negative", () => {
      const tiny = {
        window: { width: 30, height: 10, resizable: false },
      } as const;
      expect(api("nobody", tiny).bounds()).toEqual({ width: 30, height: 0 });
    });
  });

  it("`registerShortcut` is scoped to its window", () => {
    register(def("a"), def("b"));
    os.windows.openApp("a");
    os.windows.openApp("b");
    uninstall = installShortcuts();
    const h = vi.fn();
    const off = api("a").registerShortcut({ combo: "Ctrl+K", handler: h });
    cleanups.push(off);
    const press = () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );

    // b is focused.
    press();
    expect(h).not.toHaveBeenCalled();
    os.windows.focusWindow("a");
    press();
    expect(h).toHaveBeenCalledTimes(1);
    off();
    press();
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("`content` and `media` are the providers", () => {
    const a = api("a");
    expect(a.content.profile().name).toBe(content.profile.name);
    // The bound provider itself, so this holds for the placeholder and for
    // the provider media/index.ts picks (#116), and nothing is fetched.
    expect(a.media).toBe(media);
  });
});
