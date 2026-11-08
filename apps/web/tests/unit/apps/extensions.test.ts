import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  contextMenus,
  notifications,
  shortcuts,
  topBar,
  type TrayItem,
} from "@/os/apps/extensions";
import * as input from "@/os/input/shortcuts";
import { useOS } from "@/os/store";
import type { MenuItem } from "@/os/ui/Menu";

const item = (id: string): MenuItem => ({ id, label: id, onSelect() {} });
const ids = (list: readonly { id: string }[]) => list.map((i) => i.id);
const tray = (id: string, order?: number): TrayItem => ({
  id,
  label: id,
  order,
  render: () => null,
});

// The registries are module state shared by the tests in this file.
let cleanups: (() => void)[];
const keep = (off: () => void) => {
  cleanups.push(off);
  return off;
};

beforeEach(() => {
  cleanups = [];
  localStorage.clear();
  useOS.setState(useOS.getInitialState(), true);
});
afterEach(() => {
  cleanups.forEach((off) => off());
  vi.restoreAllMocks();
});

describe("contextMenus", () => {
  it("context menu items are per target", () => {
    expect(contextMenus.list("desktop")).toEqual([]);
    const offFirst = keep(contextMenus.register("desktop", [item("a")]));
    keep(contextMenus.register("desktop", [item("b"), item("c")]));

    const list = contextMenus.list("desktop");
    expect(ids(list)).toEqual(["a", "desktop:separator:1", "b", "c"]);
    expect(list[1]).toMatchObject({ separator: true });
    expect(list[0]).not.toHaveProperty("separator", true);
    expect(contextMenus.list("dock-icon")).toEqual([]);
    expect(contextMenus.list("window-title")).toEqual([]);

    offFirst();
    expect(ids(contextMenus.list("desktop"))).toEqual(["b", "c"]);
  });

  it("an unregister removes only its own group, and only once", () => {
    const off = keep(contextMenus.register("dock-icon", [item("a")]));
    keep(contextMenus.register("dock-icon", [item("a")]));
    off();
    off();
    expect(ids(contextMenus.list("dock-icon"))).toEqual(["a"]);
  });

  it("an empty group adds no separator", () => {
    keep(contextMenus.register("window-title", [item("a")]));
    keep(contextMenus.register("window-title", []));
    keep(contextMenus.register("window-title", [item("b")]));
    expect(ids(contextMenus.list("window-title"))).toEqual([
      "a",
      "window-title:separator:1",
      "b",
    ]);
  });

  it("numbers separators per list", () => {
    keep(contextMenus.register("desktop", [item("a")]));
    keep(contextMenus.register("desktop", [item("b")]));
    keep(contextMenus.register("desktop", [item("c")]));
    expect(ids(contextMenus.list("desktop"))).toEqual([
      "a",
      "desktop:separator:1",
      "b",
      "desktop:separator:2",
      "c",
    ]);
  });

  it("announces each change once, to subscribers only", () => {
    const cb = vi.fn();
    const stop = keep(contextMenus.subscribe(cb));
    const off = contextMenus.register("desktop", [item("a")]);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    expect(cb).toHaveBeenCalledTimes(2);
    stop();
    keep(contextMenus.register("desktop", [item("b")]));
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe("snapshots", () => {
  it("a snapshot is stable until something changes", () => {
    keep(contextMenus.register("desktop", [item("a")]));
    const before = contextMenus.list("desktop");
    expect(contextMenus.list("desktop")).toBe(before);
    // Another target's change leaves this list alone.
    keep(contextMenus.register("dock-icon", [item("x")]));
    expect(contextMenus.list("desktop")).toBe(before);
    keep(contextMenus.register("desktop", [item("b")]));
    expect(contextMenus.list("desktop")).not.toBe(before);

    // An empty list is one array too, or a subscriber would loop.
    expect(contextMenus.list("window-title")).toBe(
      contextMenus.list("window-title"),
    );

    keep(topBar.registerTrayItem(tray("t1")));
    const trayBefore = topBar.listTrayItems();
    expect(topBar.listTrayItems()).toBe(trayBefore);
    keep(topBar.registerTrayItem(tray("t2")));
    expect(topBar.listTrayItems()).not.toBe(trayBefore);
  });
});

describe("topBar", () => {
  it("tray items are sorted by order and announced", () => {
    const cb = vi.fn();
    keep(topBar.subscribe(cb));
    keep(topBar.registerTrayItem(tray("late", 20)));
    expect(cb).toHaveBeenCalledTimes(1);
    const offEarly = keep(topBar.registerTrayItem(tray("early", 10)));
    expect(cb).toHaveBeenCalledTimes(2);
    expect(ids(topBar.listTrayItems())).toEqual(["early", "late"]);

    offEarly();
    expect(cb).toHaveBeenCalledTimes(3);
    expect(ids(topBar.listTrayItems())).toEqual(["late"]);
    offEarly();
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("a missing order is 0, and ties keep registration order", () => {
    keep(topBar.registerTrayItem(tray("b")));
    keep(topBar.registerTrayItem(tray("a")));
    keep(topBar.registerTrayItem(tray("neg", -5)));
    keep(topBar.registerTrayItem(tray("c", 0)));
    expect(ids(topBar.listTrayItems())).toEqual(["neg", "b", "a", "c"]);
  });

  it("a duplicate tray id throws", () => {
    const cb = vi.fn();
    const off = keep(topBar.registerTrayItem(tray("same")));
    keep(topBar.subscribe(cb));
    expect(() => topBar.registerTrayItem(tray("same"))).toThrow(/same/);
    // Nothing changed, nothing announced.
    expect(cb).not.toHaveBeenCalled();
    expect(ids(topBar.listTrayItems())).toEqual(["same"]);
    // The id is free again after an unregister, and an old unregister cannot
    // remove its replacement.
    off();
    keep(topBar.registerTrayItem(tray("same")));
    off();
    expect(ids(topBar.listTrayItems())).toEqual(["same"]);
  });
});

describe("notifications", () => {
  it("`notifications.push` reaches the store", () => {
    const id = notifications.push({ title: "Saved", body: "All done" });
    const items = useOS.getState().notifications.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id, title: "Saved", body: "All done" });
  });
});

describe("shortcuts", () => {
  it("re-exports the shortcut registry", () => {
    expect(shortcuts).toBe(input.shortcuts);
  });
});
