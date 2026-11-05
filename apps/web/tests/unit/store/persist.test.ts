import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const KEY = "beselfos:settings";

const seed = (settings: unknown) =>
  localStorage.setItem(
    KEY,
    JSON.stringify({ state: { settings }, version: 0 }),
  );

const stored = () => {
  const raw = localStorage.getItem(KEY);
  return raw === null ? null : JSON.parse(raw);
};

// The store is built at import time, so every test imports a fresh copy.
async function load() {
  vi.resetModules();
  return import("@/os/store");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("control: stock persist", () => {
  // Shows why the guards exist. If zustand ever fixes these, this fails and
  // the guards can be reconsidered.
  it("writes on every set, including before hydration", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const store = create<{ a: number; b: number }>()(
      persist(() => ({ a: 0, b: 0 }), {
        name: "control",
        skipHydration: true,
        partialize: (s) => ({ a: s.a }),
      }),
    );
    store.setState({ b: 1 });
    store.setState({ b: 2 });
    expect(setItem).toHaveBeenCalledTimes(2);
  });
});

describe("settings persistence", () => {
  it("starts on defaults until rehydrated", async () => {
    seed({ wallpaper: "mono" });
    const { useOS, rehydrateSettings } = await load();
    expect(useOS.getState().settings.wallpaper).toBe("aubergine");
    rehydrateSettings();
    expect(useOS.getState().settings.wallpaper).toBe("mono");
  });

  it("an early action cannot overwrite stored settings", async () => {
    seed({ wallpaper: "mono" });
    const { os, useOS, rehydrateSettings } = await load();
    os.notifications.push({ title: "early" });
    expect(stored().state.settings.wallpaper).toBe("mono");
    rehydrateSettings();
    expect(useOS.getState().settings.wallpaper).toBe("mono");
  });

  it("writes only when settings change", async () => {
    const { os, rehydrateSettings } = await load();
    rehydrateSettings();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    for (let i = 0; i < 5; i++) os.notifications.push({ title: `n${i}` });
    os.shell.setActivitiesOpen(true);
    os.shell.setPopover("power");
    os.shell.setAltTabIndex(1);
    expect(setItem).toHaveBeenCalledTimes(0);
    os.settings.update({ wallpaper: "orange" });
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it("stores settings alone", async () => {
    const { os, rehydrateSettings } = await load();
    rehydrateSettings();
    os.notifications.push({ title: "x" });
    os.shell.setActivitiesOpen(true);
    os.settings.update({ sound: true });
    expect(Object.keys(stored().state)).toEqual(["settings"]);
  });

  it("survives a reload", async () => {
    const first = await load();
    first.rehydrateSettings();
    first.os.settings.update({ wallpaper: "orange", bootMode: "fast" });
    const second = await load();
    second.rehydrateSettings();
    const s = second.useOS.getState().settings;
    expect(s.wallpaper).toBe("orange");
    expect(s.bootMode).toBe("fast");
  });

  it("a missing stored field keeps its default", async () => {
    seed({ wallpaper: "mono" });
    const { useOS, rehydrateSettings } = await load();
    rehydrateSettings();
    const s = useOS.getState().settings;
    expect(s.wallpaper).toBe("mono");
    expect(s.bootMode).toBe("full");
    expect(s.persistLayout).toBe(false);
  });

  it("an invalid stored value falls back per field", async () => {
    seed({ wallpaper: "neon", bootMode: "fast" });
    const { useOS, rehydrateSettings } = await load();
    rehydrateSettings();
    const s = useOS.getState().settings;
    expect(s.wallpaper).toBe("aubergine");
    expect(s.bootMode).toBe("fast");
  });

  it("unknown stored keys are dropped", async () => {
    seed({ wallpaper: "mono", legacy: 1 });
    const { useOS, rehydrateSettings } = await load();
    rehydrateSettings();
    expect(useOS.getState().settings).not.toHaveProperty("legacy");
  });

  it.each([
    ["not json", () => localStorage.setItem(KEY, "{not json")],
    ["a non-object settings", () => seed("junk")],
  ])("corrupt storage falls back: %s", async (_name, plant) => {
    plant();
    const { os, useOS, rehydrateSettings } = await load();
    expect(() => rehydrateSettings()).not.toThrow();
    expect(useOS.getState().settings.wallpaper).toBe("aubergine");
    os.settings.update({ wallpaper: "mono" });
    expect(stored().state.settings.wallpaper).toBe("mono");
  });

  it("empty storage leaves state alone", async () => {
    const { os, useOS, rehydrateSettings } = await load();
    os.settings.update({ wallpaper: "mono" });
    rehydrateSettings();
    expect(useOS.getState().settings.wallpaper).toBe("mono");
  });

  it("a failing storage does not break the app", async () => {
    const { os, useOS, rehydrateSettings } = await load();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => rehydrateSettings()).not.toThrow();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(() => os.settings.update({ wallpaper: "mono" })).not.toThrow();
    expect(useOS.getState().settings.wallpaper).toBe("mono");
  });

  it("a failed write is not retried", async () => {
    const { os, rehydrateSettings } = await load();
    rehydrateSettings();
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("full");
      });
    os.settings.update({ wallpaper: "mono" });
    expect(setItem).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 3; i++) os.notifications.push({ title: `n${i}` });
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
