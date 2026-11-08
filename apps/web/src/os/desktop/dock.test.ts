import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contextMenus } from "@/os/apps/extensions";
import { appLookup, dockApps, getApp } from "@/os/apps/registry";
import { os, useOS } from "@/os/store";
import type { AppLookup, WindowApp } from "@/os/store/windows";
import type { MenuItem } from "@/os/ui/Menu";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import {
  applyDockClick,
  dockClick,
  dockEntries,
  dockMenu,
  UNPIN_NOTICE,
  type DockApp,
} from "./dock";

// Two test apps beside the real ones. "m" can have several windows (m:a, m:b),
// "extra" is a singleton that is not pinned.
const windowApp = (id: string, over: Partial<WindowApp> = {}): WindowApp => ({
  id,
  name: id,
  window: { width: 300, height: 200 },
  capabilities: { maximize: false },
  singleton: true,
  ...over,
});
const multiWindow = windowApp("m", {
  singleton: false,
  instanceKey: (a) => (a as { key: string }).key,
  defaultArgs: { key: "a" },
});
const lookup: AppLookup = (id) => {
  if (id === "m") return multiWindow;
  if (id === "extra") return windowApp("extra");
  return appLookup(id);
};

const multi: DockApp = {
  id: "m",
  name: "Multi",
  icon: "/icons/apps/m.svg",
  dock: { pinned: true, order: 5 },
  singleton: false,
  defaultArgs: { key: "a" },
};
const extra: DockApp = {
  id: "extra",
  name: "Extra",
  icon: "/icons/apps/extra.svg",
  dock: { pinned: false, order: 9 },
  singleton: true,
};
const projects = getApp("projects")!;

const unregisters: (() => void)[] = [];

beforeEach(() => {
  setupBrowser();
  os.windows.setAppLookup(lookup);
});
afterEach(() => {
  // The extension registry is module level: one test must not leak into the next.
  for (const off of unregisters.splice(0)) off();
  teardownBrowser();
});

const state = () => useOS.getState();
const windows = () => useOS.getState().windows.items;
const win = (id: string) => windows().find((w) => w.id === id);
const ids = (list: readonly { id: string }[]) => list.map((a) => a.id);
const labels = (items: readonly MenuItem[]) =>
  items.map((i) => (i.separator ? "---" : i.label));
const choose = (items: readonly MenuItem[], id: string) => {
  const item = items.find((i) => i.id === id);
  if (!item || item.separator) throw new Error(`no menu item "${id}"`);
  item.onSelect();
};

describe("dockEntries", () => {
  it("the dock lists apps with a dock entry", () => {
    expect(ids(dockEntries(state(), dockApps))).toEqual([
      "projects",
      "skills",
      "about",
    ]);

    // Hello and Video Player have no dock entry: a window does not add one.
    os.windows.openApp("hello");
    os.windows.openApp("video-player", { projectId: "p" });
    expect(win("hello")).toBeDefined();
    expect(win("video-player:p")).toBeDefined();
    expect(ids(dockEntries(state(), dockApps))).toEqual([
      "projects",
      "skills",
      "about",
    ]);
  });

  it("returns the registry's own objects, in the list's order", () => {
    const entries = dockEntries(state(), dockApps);
    expect(entries[0]).toBe(dockApps[0]);
    expect(entries[2]).toBe(dockApps[2]);
    expect(ids(dockEntries(state(), [...dockApps].reverse()))).toEqual([
      "about",
      "skills",
      "projects",
    ]);
  });

  it("shows an unpinned app only while it has a window", async () => {
    const list = [...dockApps, extra];
    const shown = () => ids(dockEntries(state(), list));
    expect(shown()).toEqual(["projects", "skills", "about"]);

    os.windows.openApp("extra");
    expect(shown()).toEqual(["projects", "skills", "about", "extra"]);

    // Minimised still counts as running.
    os.windows.minimizeWindow("extra");
    expect(win("extra")?.status).toBe("minimized");
    expect(shown()).toEqual(["projects", "skills", "about", "extra"]);

    await os.windows.closeWindow("extra");
    expect(shown()).toEqual(["projects", "skills", "about"]);
  });

  it("keeps a pinned app with no window, and drops an app with no dock", () => {
    const hidden: DockApp = { ...extra, id: "hidden", dock: null };
    os.windows.openApp("extra");
    const list = [hidden, extra, projects];
    expect(ids(dockEntries(state(), list))).toEqual(["extra", "projects"]);
  });
});

describe("dockClick", () => {
  it("opens an app that has no window", () => {
    expect(dockClick(state(), "projects")).toEqual({ kind: "open" });
  });

  it("minimises an app that owns the focused window", () => {
    os.windows.openApp("projects");
    expect(dockClick(state(), "projects")).toEqual({
      kind: "minimize",
      ids: ["projects"],
    });
  });

  it("focuses an open app that is not focused", () => {
    os.windows.openApp("projects");
    os.windows.openApp("skills");
    // Skills is on top now.
    expect(dockClick(state(), "projects")).toEqual({
      kind: "focus",
      id: "projects",
    });
    expect(dockClick(state(), "skills")).toEqual({
      kind: "minimize",
      ids: ["skills"],
    });
  });

  it("restores a minimised app", () => {
    os.windows.openApp("projects");
    os.windows.minimizeWindow("projects");
    expect(dockClick(state(), "projects")).toEqual({
      kind: "restore",
      ids: ["projects"],
    });
  });

  it("restores a minimised app even while another one is focused", () => {
    os.windows.openApp("projects");
    os.windows.openApp("skills");
    os.windows.minimizeWindow("projects");
    expect(dockClick(state(), "projects")).toEqual({
      kind: "restore",
      ids: ["projects"],
    });
  });

  describe("an app with several windows", () => {
    beforeEach(() => {
      os.windows.openApp("m", { key: "a" });
      os.windows.openApp("m", { key: "b" });
    });

    it("minimises all of them while it owns the focus", () => {
      expect(win("m:b")!.z).toBeGreaterThan(win("m:a")!.z);
      expect(dockClick(state(), "m")).toEqual({
        kind: "minimize",
        ids: ["m:a", "m:b"],
      });
    });

    it("minimises only the open ones", () => {
      os.windows.minimizeWindow("m:a");
      expect(dockClick(state(), "m")).toEqual({
        kind: "minimize",
        ids: ["m:b"],
      });
    });

    it("focuses its highest open window when another app has the focus", () => {
      os.windows.openApp("projects");
      expect(dockClick(state(), "m")).toEqual({ kind: "focus", id: "m:b" });

      os.windows.minimizeWindow("m:b");
      expect(dockClick(state(), "m")).toEqual({ kind: "focus", id: "m:a" });
    });

    it("restores all of them, lowest z first, so the highest ends on top", () => {
      os.windows.minimizeWindow("m:a");
      os.windows.minimizeWindow("m:b");
      expect(dockClick(state(), "m")).toEqual({
        kind: "restore",
        ids: ["m:a", "m:b"],
      });

      applyDockClick("m");
      expect(win("m:a")!.status).toBe("open");
      expect(win("m:b")!.status).toBe("open");
      expect(win("m:b")!.z).toBeGreaterThan(win("m:a")!.z);
    });
  });
});

describe("applyDockClick", () => {
  it("goes from open and focused, to minimised, to open and focused", () => {
    applyDockClick("projects");
    expect(win("projects")?.status).toBe("open");

    applyDockClick("projects");
    expect(win("projects")?.status).toBe("minimized");

    applyDockClick("projects");
    expect(win("projects")?.status).toBe("open");
    expect(state().windows.items).toHaveLength(1);
  });

  it("focuses an unfocused app and leaves the other one open", () => {
    applyDockClick("projects");
    applyDockClick("skills");
    applyDockClick("projects");
    expect(win("skills")?.status).toBe("open");
    expect(win("projects")!.z).toBeGreaterThan(win("skills")!.z);
  });

  it("opens, minimises and restores through the window actions", () => {
    const open = vi.spyOn(os.windows, "openApp");
    const minimize = vi.spyOn(os.windows, "minimizeWindow");
    const restore = vi.spyOn(os.windows, "restoreWindow");
    const focus = vi.spyOn(os.windows, "focusWindow");

    applyDockClick("projects");
    expect(open).toHaveBeenCalledWith("projects");
    applyDockClick("projects");
    expect(minimize).toHaveBeenCalledWith("projects");
    applyDockClick("projects");
    expect(restore).toHaveBeenCalledWith("projects");
    applyDockClick("skills");
    applyDockClick("projects");
    expect(focus).toHaveBeenCalledWith("projects");
  });
});

describe("dockMenu", () => {
  it("offers only Unpin for a pinned singleton with no window", () => {
    expect(labels(dockMenu(state(), projects))).toEqual(["Unpin"]);
  });

  it("adds Quit, last, while the app has a window", () => {
    os.windows.openApp("projects");
    expect(labels(dockMenu(state(), projects))).toEqual(["Unpin", "Quit"]);
    os.windows.minimizeWindow("projects");
    expect(labels(dockMenu(state(), projects))).toEqual(["Unpin", "Quit"]);
  });

  it("offers no Unpin for an app that is not pinned", () => {
    os.windows.openApp("extra");
    expect(labels(dockMenu(state(), extra))).toEqual(["Quit"]);
  });

  describe("New Window", () => {
    it("comes first for a multi-instance app, and opens it", () => {
      const open = vi.spyOn(os.windows, "openApp");
      const items = dockMenu(state(), multi);
      expect(labels(items)).toEqual(["New Window", "Unpin"]);
      const first = items[0];
      expect(first.separator).toBeFalsy();
      if (first.separator) throw new Error("unreachable");
      expect(first.disabled).toBe(false);

      first.onSelect();
      expect(open).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledWith("m");
      expect(win("m:a")).toBeDefined();
    });

    it("is disabled without default args, because openApp would throw", () => {
      const noArgs: DockApp = { ...multi, defaultArgs: undefined };
      const items = dockMenu(state(), noArgs);
      const first = items[0];
      expect(first.separator).toBeFalsy();
      if (first.separator) throw new Error("unreachable");
      expect(first.label).toBe("New Window");
      expect(first.disabled).toBe(true);
    });

    it("never shows for a singleton", () => {
      os.windows.openApp("projects");
      expect(labels(dockMenu(state(), projects))).not.toContain("New Window");
      expect(labels(dockMenu(state(), extra))).not.toContain("New Window");
    });
  });

  describe("Quit", () => {
    it("closes both windows of an app that has two", () => {
      os.windows.openApp("m", { key: "a" });
      os.windows.openApp("m", { key: "b" });
      os.windows.openApp("projects");
      choose(dockMenu(state(), multi), "dock:quit");
      expect(ids(windows())).toEqual(["projects"]);
    });

    it("reads the windows when it is chosen, not when the menu was built", () => {
      os.windows.openApp("m", { key: "a" });
      const items = dockMenu(state(), multi);
      os.windows.openApp("m", { key: "b" });
      choose(items, "dock:quit");
      expect(windows()).toHaveLength(0);
    });
  });

  describe("Unpin", () => {
    it("pushes the notice and leaves the app in the dock", () => {
      expect(UNPIN_NOTICE).toEqual({
        title: "Unpin",
        body: "Unpinning apps is coming soon.",
      });
      choose(dockMenu(state(), projects), "dock:unpin");
      const pushed = state().notifications.items;
      expect(pushed).toHaveLength(1);
      expect(pushed[0]).toMatchObject({
        title: "Unpin",
        body: "Unpinning apps is coming soon.",
      });
      expect(ids(dockEntries(state(), dockApps))).toContain("projects");
    });
  });

  describe("items registered for dock-icon", () => {
    const item: MenuItem = {
      id: "ext:one",
      label: "Extra thing",
      onSelect: () => {},
    };

    it("come after a separator, and go with their unregister", () => {
      const off = contextMenus.register("dock-icon", [item]);
      unregisters.push(off);

      const items = dockMenu(state(), projects);
      expect(labels(items)).toEqual(["Unpin", "---", "Extra thing"]);
      expect(items[1].separator).toBe(true);

      off();
      expect(labels(dockMenu(state(), projects))).toEqual(["Unpin"]);
    });

    it("sit after Quit as well", () => {
      unregisters.push(contextMenus.register("dock-icon", [item]));
      os.windows.openApp("projects");
      expect(labels(dockMenu(state(), projects))).toEqual([
        "Unpin",
        "Quit",
        "---",
        "Extra thing",
      ]);
    });
  });
});
