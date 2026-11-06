import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShallow } from "zustand/react/shallow";
import {
  focusedWindow,
  isAppRunning,
  orderedWindows,
  os,
  useOS,
  windowsForApp,
} from "@/os/store";
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
const keyed = (id: string, over: Partial<WindowApp> = {}) =>
  def(id, {
    singleton: false,
    instanceKey: (a) => (a as { k: string }).k,
    ...over,
  });
const register = (...defs: WindowApp[]) =>
  defs.forEach((d) => apps.set(d.id, d));

const wins = () => useOS.getState().windows;
const win = (id: string) => {
  const found = wins().items.find((w) => w.id === id);
  if (!found) throw new Error(`no window ${id}`);
  return found;
};
const ids = () => orderedWindows(useOS.getState()).map((w) => w.id);
const focusedId = () => focusedWindow(useOS.getState())?.id ?? null;
const pos = (id: string) => win(id).position;
const screen = (workArea: { x: number; y: number; w: number; h: number }) =>
  os.windows.setScreen({ mode: "laptop", workArea });

beforeEach(() => {
  apps.clear();
  localStorage.clear();
  useOS.setState(useOS.getInitialState(), true);
  os.windows.setAppLookup((id) => apps.get(id));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shape", () => {
  it("action list", () => {
    expect(Object.keys(os.windows).sort()).toEqual([
      "cycleFocus",
      "focusWindow",
      "minimizeAll",
      "minimizeWindow",
      "moveWindow",
      "openApp",
      "restoreWindow",
      "setAppLookup",
      "setScreen",
      "setTitle",
    ]);
  });

  it("initial state", () => {
    expect(useOS.getInitialState().windows).toEqual({
      items: [],
      mode: "laptop",
      workArea: { x: 64, y: 32, w: 1376, h: 868 },
    });
  });

  it("a window has the 4.2 fields", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    register(
      keyed("viewer", {
        window: { width: 500, height: 350 },
        title: (a) => `View ${(a as { k: string }).k}`,
        capabilities: { maximize: true, alwaysOnTop: true },
      }),
    );
    os.windows.openApp("viewer", { k: "x" });
    expect(win("viewer:x")).toEqual({
      id: "viewer:x",
      appId: "viewer",
      args: { k: "x" },
      title: "View x",
      position: { x: 96, y: 64 },
      size: { width: 500, height: 350 },
      status: "open",
      maximized: false,
      alwaysOnTop: true,
      z: expect.any(Number),
      openedAt: 5000,
    });
    // toEqual ignores an undefined key, so the key list pins workspaceId.
    expect(Object.keys(win("viewer:x")).sort()).toEqual([
      "alwaysOnTop",
      "appId",
      "args",
      "id",
      "maximized",
      "openedAt",
      "position",
      "size",
      "status",
      "title",
      "z",
    ]);
  });

  it("matches the 4.1 shape", () => {
    interface Shape<Args> {
      id: string;
      name: string;
      window: { width: number; height: number; resizable: false };
      capabilities: { maximize: boolean; minimize: boolean; close: boolean };
      singleton: boolean;
      instanceKey?: (args: Args) => string;
      title?: (args: Args) => string;
    }
    const shaped: Shape<{ projectId: string }> = {
      id: "project",
      name: "Project",
      window: { width: 400, height: 300, resizable: false },
      capabilities: { maximize: true, minimize: true, close: true },
      singleton: false,
      instanceKey: (a) => a.projectId,
      title: (a) => a.projectId,
    };
    // Fails in typecheck, not in vitest, if WindowApp uses property syntax.
    const asApp: WindowApp = shaped;
    register(asApp);
    expect(os.windows.openApp("project", { projectId: "p1" })).toBe(
      "project:p1",
    );
  });
});

describe("openApp", () => {
  it("a singleton opened twice gives one window", () => {
    register(def("a"), def("b"));
    const first = os.windows.openApp("a");
    os.windows.openApp("b");
    const second = os.windows.openApp("a");
    expect(first).toBe("a");
    expect(second).toBe("a");
    expect(wins().items.filter((w) => w.appId === "a")).toHaveLength(1);
    expect(focusedId()).toBe("a");
  });

  it("re-opening restores a minimised window", () => {
    register(def("a"), def("b"));
    os.windows.openApp("a");
    os.windows.openApp("b");
    os.windows.minimizeWindow("a");
    os.windows.openApp("a");
    expect(win("a").status).toBe("open");
    expect(focusedId()).toBe("a");
    expect(wins().items).toHaveLength(2);
  });

  it("a title set by the app survives a re-open", () => {
    register(def("a"));
    os.windows.openApp("a");
    os.windows.setTitle("a", "Custom");
    os.windows.openApp("a", { item: "z" });
    expect(win("a").title).toBe("Custom");
  });

  it("multi-instance windows are keyed", () => {
    register(keyed("viewer"));
    expect(os.windows.openApp("viewer", { k: "x" })).toBe("viewer:x");
    expect(os.windows.openApp("viewer", { k: "y" })).toBe("viewer:y");
    expect(os.windows.openApp("viewer", { k: "x" })).toBe("viewer:x");
    expect(wins().items.map((w) => w.id)).toEqual(["viewer:x", "viewer:y"]);
  });

  it("defaultArgs fills missing args", () => {
    register(keyed("viewer", { defaultArgs: { k: "inbox" } }));
    expect(os.windows.openApp("viewer")).toBe("viewer:inbox");
    expect(win("viewer:inbox").args).toEqual({ k: "inbox" });
  });

  it.each([
    ["a title function", (a: unknown) => `T ${(a as { n: number }).n}`, "T 1"],
    ["no title function", undefined, "a name"],
  ])("the title comes from the app: %s", (_n, title, expected) => {
    register(def("a", { title }));
    os.windows.openApp("a", { n: 1 });
    expect(win("a").title).toBe(expected);
  });

  it("re-opening with args replaces them", () => {
    register(
      def("a", { title: (a) => `Item ${(a as { item: string }).item}` }),
    );
    os.windows.openApp("a", { item: "a" });
    os.windows.openApp("a", { item: "b" });
    expect(win("a").args).toEqual({ item: "b" });
    expect(win("a").title).toBe("Item b");
    os.windows.openApp("a");
    expect(win("a").args).toEqual({ item: "b" });
  });

  it.each([
    ["an unknown id", () => os.windows.openApp("nope")],
    [
      "a multi-instance app with no instanceKey",
      () => {
        register(def("m", { singleton: false }));
        os.windows.openApp("m", { k: "x" });
      },
    ],
  ])("bad requests throw and change nothing: %s", (_n, run) => {
    const before = useOS.getState().windows;
    expect(run).toThrow();
    expect(useOS.getState().windows).toBe(before);
  });
});

describe("placement", () => {
  const area = { x: 10, y: 20, w: 800, h: 500 };
  const cascade = (width: number, height: number, n: number) => {
    register(keyed("k", { window: { width, height } }));
    for (let i = 0; i < n; i++) os.windows.openApp("k", { k: String(i) });
    return wins().items.map((w) => w.position);
  };
  const at = (initialPosition: "center" | { x: number; y: number }) =>
    def("a", { window: { width: 400, height: 300, initialPosition } });

  it("the first window opens one step in", () => {
    register(def("a"));
    os.windows.openApp("a");
    expect(pos("a")).toEqual({ x: 96, y: 64 });
  });

  it("cascade steps from the last window", () => {
    register(def("a"), def("b"));
    os.windows.openApp("a");
    os.windows.moveWindow("a", { x: 300, y: 200 });
    os.windows.openApp("b");
    expect(pos("b")).toEqual({ x: 332, y: 232 });
  });

  it("cascade wraps at the bottom", () => {
    const p = cascade(1040, 640, 9);
    for (let i = 0; i < 7; i++) {
      expect(p[i]).toEqual({ x: 96 + 32 * i, y: 64 + 32 * i });
    }
    expect(p[7]).toEqual(p[0]);
    expect(p[8]).toEqual(p[1]);
    for (const q of p) {
      expect(q.x).toBeGreaterThanOrEqual(64);
      expect(q.y).toBeGreaterThanOrEqual(32);
      expect(q.x + 1040).toBeLessThanOrEqual(64 + 1376);
      expect(q.y + 640).toBeLessThanOrEqual(32 + 868);
    }
  });

  it("cascade wraps at the right", () => {
    const p = cascade(1300, 100, 3);
    expect(p[2]).toEqual(p[0]);
  });

  it.each([
    [1376, 868],
    [1500, 1000],
  ])("a window that cannot fit opens at the corner: %ix%i", (w, h) => {
    register(def("a", { window: { width: w, height: h } }));
    os.windows.openApp("a");
    expect(pos("a")).toEqual({ x: 64, y: 32 });
  });

  it.each([
    [400, 300],
    [401, 301],
  ])("center centres in whole units: %ix%i", (w, h) => {
    register(
      def("a", { window: { width: w, height: h, initialPosition: "center" } }),
    );
    os.windows.openApp("a");
    expect(pos("a")).toEqual({ x: 552, y: 316 });
  });

  it("an explicit position is clamped", () => {
    register(
      { ...at({ x: 2000, y: 5 }), id: "far" },
      { ...at({ x: 300, y: 200 }), id: "ok" },
    );
    os.windows.openApp("far");
    os.windows.openApp("ok");
    expect(pos("far")).toEqual({ x: 1040, y: 32 });
    expect(pos("ok")).toEqual({ x: 300, y: 200 });
  });

  it("placement reads the live work area", () => {
    screen(area);
    register(
      def("casc"),
      { ...at("center"), id: "mid" },
      def("big", { window: { width: 1040, height: 640 } }),
    );
    os.windows.openApp("casc");
    os.windows.openApp("mid");
    os.windows.openApp("big");
    expect(pos("casc")).toEqual({ x: 42, y: 52 });
    expect(pos("mid")).toEqual({ x: 210, y: 120 });
    expect(pos("big")).toEqual({ x: 10, y: 20 });
  });
});

describe("selectors", () => {
  const open = (...names: string[]) => {
    register(
      ...names.map((n) =>
        def(n, {
          capabilities: {
            maximize: false,
            alwaysOnTop: n === "p" || n === "q",
          },
        }),
      ),
    );
    names.forEach((n) => os.windows.openApp(n));
  };

  it("orderedWindows sorts by z", () => {
    open("a", "b", "c");
    os.windows.openApp("a");
    expect(ids()).toEqual(["b", "c", "a"]);
  });

  it("alwaysOnTop sorts above the rest, by z in each band", () => {
    open("a", "p", "b", "q");
    expect(ids()).toEqual(["a", "b", "p", "q"]);
    os.windows.focusWindow("p");
    expect(ids()).toEqual(["a", "b", "q", "p"]);
    os.windows.focusWindow("a");
    expect(ids()).toEqual(["b", "a", "q", "p"]);
  });

  it("focusedWindow can sit under an always-on-top window", () => {
    open("a", "p", "b", "q");
    os.windows.focusWindow("a");
    expect(focusedId()).toBe("a");
  });

  it("orderedWindows keeps minimised windows", () => {
    open("a", "b", "c");
    os.windows.minimizeWindow("c");
    expect(ids()).toHaveLength(3);
  });

  it("focus falls to the next open window", () => {
    open("a", "b", "c");
    os.windows.minimizeWindow("c");
    expect(focusedId()).toBe("b");
    os.windows.minimizeAll();
    expect(focusedId()).toBeNull();
  });

  it("windowsForApp and isAppRunning", () => {
    register(keyed("viewer"), def("notes"));
    os.windows.openApp("viewer", { k: "1" });
    os.windows.openApp("viewer", { k: "2" });
    os.windows.openApp("notes");
    const s = useOS.getState();
    expect(windowsForApp(s, "viewer").map((w) => w.id)).toEqual([
      "viewer:1",
      "viewer:2",
    ]);
    expect(windowsForApp(s, "notes").map((w) => w.id)).toEqual(["notes"]);
    expect(isAppRunning(s, "notes")).toBe(true);
    expect(isAppRunning(s, "nope")).toBe(false);
    os.windows.minimizeWindow("notes");
    expect(isAppRunning(useOS.getState(), "notes")).toBe(true);
  });

  it("useShallow(orderedWindows) re-renders only when the list changes", () => {
    register(def("a"));
    let renders = 0;
    renderHook(() => {
      renders++;
      return useOS(useShallow(orderedWindows));
    });
    const base = renders;
    act(() => {
      os.notifications.push({ title: "hi" });
    });
    expect(renders).toBe(base);
    act(() => {
      os.windows.openApp("a");
    });
    expect(renders).toBe(base + 1);
  });
});

describe("focus and z", () => {
  const three = () => {
    register(def("a"), def("b"), def("c"));
    ["a", "b", "c"].forEach((n) => os.windows.openApp(n));
  };

  it("focus raises only that window", () => {
    three();
    const [b, c] = [win("b"), win("c")];
    os.windows.focusWindow("a");
    expect(focusedId()).toBe("a");
    expect(win("b")).toBe(b);
    expect(win("c")).toBe(c);
  });

  it("z only goes up", () => {
    register(def("a"), def("b"), def("c"));
    os.windows.openApp("a");
    os.windows.openApp("b");
    const last = win("b").z;
    useOS.setState((s) => {
      s.windows.items = s.windows.items.filter((w) => w.id !== "b");
    });
    os.windows.openApp("c");
    expect(win("c").z).toBeGreaterThan(last);
  });

  it("focusing the top window changes nothing", () => {
    three();
    const before = wins();
    os.windows.focusWindow("c");
    expect(wins()).toBe(before);
  });

  it("focusing a minimised window changes nothing", () => {
    three();
    os.windows.minimizeWindow("a");
    const before = wins();
    os.windows.focusWindow("a");
    expect(wins()).toBe(before);
  });
});

describe("minimise and restore", () => {
  it("minimise hides without removing", () => {
    register(def("a"));
    os.windows.openApp("a");
    os.windows.moveWindow("a", { x: 300, y: 200 });
    os.windows.minimizeWindow("a");
    expect(win("a").status).toBe("minimized");
    expect(pos("a")).toEqual({ x: 300, y: 200 });
  });

  it("restore brings a window back on top", () => {
    register(def("a"), def("b"));
    os.windows.openApp("a");
    os.windows.openApp("b");
    const at = pos("a");
    os.windows.minimizeWindow("a");
    os.windows.restoreWindow("a");
    expect(focusedId()).toBe("a");
    expect(pos("a")).toEqual(at);
  });

  it("minimizeAll minimises what is open", () => {
    register(def("a"), def("b"), def("c"));
    ["a", "b", "c"].forEach((n) => os.windows.openApp(n));
    os.windows.minimizeWindow("c");
    const c = win("c");
    os.windows.minimizeAll();
    expect(wins().items.every((w) => w.status === "minimized")).toBe(true);
    expect(win("c")).toBe(c);
    expect(focusedId()).toBeNull();
  });
});

describe("move and title", () => {
  const three = () => {
    register(def("a"), def("b"), def("c"));
    ["a", "b", "c"].forEach((n) => os.windows.openApp(n));
  };

  it("moving one window leaves the others reference-equal", () => {
    three();
    const [a, b, c] = [win("a"), win("b"), win("c")];
    os.windows.moveWindow("b", { x: 5, y: 6 });
    expect(win("a")).toBe(a);
    expect(win("c")).toBe(c);
    expect(win("b")).not.toBe(b);
  });

  it("a drag re-renders only the dragged window", () => {
    three();
    const counts = { a: 0, b: 0, order: 0 };
    const sel = (id: string) => (s: ReturnType<typeof useOS.getState>) =>
      s.windows.items.find((w) => w.id === id);
    renderHook(() => {
      counts.a++;
      return useOS(sel("a"));
    });
    renderHook(() => {
      counts.b++;
      return useOS(sel("b"));
    });
    renderHook(() => {
      counts.order++;
      return useOS(useShallow((s) => orderedWindows(s).map((w) => w.id)));
    });
    const before = { ...counts };
    act(() => os.windows.moveWindow("a", { x: 7, y: 8 }));
    expect(counts.a).toBe(before.a + 1);
    expect(counts.b).toBe(before.b);
    expect(counts.order).toBe(before.order);
  });

  it("moveWindow keeps no reference to the caller's point", () => {
    three();
    const p = { x: 10, y: 20 };
    os.windows.moveWindow("a", p);
    expect(() => {
      p.x = 99;
    }).not.toThrow();
    expect(pos("a")).toEqual({ x: 10, y: 20 });
  });

  it("setTitle changes only that window", () => {
    three();
    const [a, c] = [win("a"), win("c")];
    os.windows.setTitle("b", "New");
    expect(win("b").title).toBe("New");
    expect(win("a")).toBe(a);
    expect(win("c")).toBe(c);
  });
});

describe("cycleFocus", () => {
  beforeEach(() => {
    register(def("a"), def("b"), def("c"));
    ["a", "b", "c"].forEach((n) => os.windows.openApp(n));
  });
  const run = (dir: 1 | -1, n: number) =>
    Array.from({ length: n }, () => {
      os.windows.cycleFocus(dir);
      return focusedId();
    });

  it("forward visits every window, most recent first", () => {
    expect(run(1, 3)).toEqual(["b", "a", "c"]);
  });

  it("backward is the reverse", () => {
    expect(run(-1, 3)).toEqual(["a", "b", "c"]);
  });

  it("one step each way returns to the start", () => {
    os.windows.cycleFocus(1);
    os.windows.cycleFocus(-1);
    expect(focusedId()).toBe("c");
    expect(ids()).toEqual(["a", "b", "c"]);
  });

  it("minimised windows are left out", () => {
    os.windows.minimizeWindow("b");
    const b = win("b");
    expect(run(1, 2)).toEqual(["a", "c"]);
    expect(win("b")).toBe(b);
  });

  it("one window changes nothing", () => {
    os.windows.minimizeWindow("a");
    os.windows.minimizeWindow("b");
    const before = wins();
    os.windows.cycleFocus(1);
    expect(wins()).toBe(before);
  });
});
