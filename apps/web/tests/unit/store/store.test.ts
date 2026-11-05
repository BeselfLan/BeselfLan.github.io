import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { os, useOS } from "@/os/store";

beforeEach(() => {
  useOS.setState(useOS.getInitialState(), true);
});

describe("store", () => {
  it("is built with immer", () => {
    const before = useOS.getState().notifications.items;
    os.notifications.push({ title: "a" });
    const after = useOS.getState().notifications.items;
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(1);
    expect(Object.isFrozen(after)).toBe(true);
  });

  it("subscribes through selectors", () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useOS((s) => s.settings.wallpaper);
    });
    const start = renders;
    act(() => {
      os.notifications.push({ title: "a" });
    });
    expect(renders).toBe(start);
    act(() => {
      os.settings.update({ wallpaper: "mono" });
    });
    expect(renders).toBe(start + 1);
  });

  it("actions need no React and no this", () => {
    const { push } = os.notifications;
    const { toggleActivities } = os.shell;
    push({ title: "a" });
    toggleActivities();
    expect(useOS.getState().notifications.items).toHaveLength(1);
    expect(useOS.getState().shell.activitiesOpen).toBe(true);
  });
});

describe("devtools", () => {
  const connect = vi.fn();

  beforeEach(() => {
    connect.mockReset();
    connect.mockReturnValue({
      init: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
      send: vi.fn(),
    });
    vi.stubGlobal("__REDUX_DEVTOOLS_EXTENSION__", { connect });
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("connects outside production", async () => {
    await import("@/os/store");
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("does not connect in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await import("@/os/store");
    expect(connect).not.toHaveBeenCalled();
  });
});
