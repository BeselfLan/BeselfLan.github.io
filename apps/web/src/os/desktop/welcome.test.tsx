import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { os, useOS } from "@/os/store";
import type { BootMode } from "@/os/boot/stages";
import {
  open,
  register,
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import {
  useWelcome,
  welcomeBody,
  WELCOME_TITLE,
  WELCOMED_KEY,
} from "./welcome";

// The hook alone, with no Screen: it renders nothing. The stage is moved by
// writing the store, which only useWelcome reads here.

beforeEach(() => {
  setupBrowser();
  sessionStorage.clear();
});
afterEach(teardownBrowser);

type Stage = "desktop" | "restarting";
const goTo = (stage: Stage, mode: BootMode = "full") =>
  act(() => {
    useOS.setState((s) => {
      s.boot.stage = stage;
      s.boot.mode = mode;
    });
  });
const notices = () => useOS.getState().notifications.items;
const welcomed = () => sessionStorage.getItem(WELCOMED_KEY);

describe("welcomeBody", () => {
  it("follows the dock's apps and the mode", () => {
    expect(welcomeBody(["Projects", "Skills", "About"], "laptop")).toBe(
      "Open Projects, Skills or About from the dock on the left.",
    );
    expect(welcomeBody(["Projects", "Skills", "About"], "fullscreen")).toBe(
      "Open Projects, Skills or About from the dock at the bottom.",
    );
    expect(welcomeBody(["Projects"], "laptop")).toBe(
      "Open Projects from the dock on the left.",
    );
    expect(welcomeBody(["Projects", "Skills"], "laptop")).toBe(
      "Open Projects or Skills from the dock on the left.",
    );
    expect(welcomeBody(["A", "B", "C", "D"], "laptop")).toBe(
      "Open A, B, C or D from the dock on the left.",
    );
  });

  it("still reads well with no names", () => {
    expect(welcomeBody([], "laptop")).toBe(
      "Open an app from the dock on the left.",
    );
  });
});

describe("useWelcome", () => {
  it("names the pinned dock apps", () => {
    renderHook(() => useWelcome());
    expect(notices()).toHaveLength(0);
    goTo("desktop");
    expect(notices().map((n) => n.title)).toEqual([WELCOME_TITLE]);
    expect(notices()[0].body).toBe(
      "Open Projects, Skills or About from the dock on the left.",
    );
  });

  it.each<BootMode>(["full", "fast", "skip"])(
    "greets the first empty desktop of a %s boot",
    (mode) => {
      renderHook(() => useWelcome());
      goTo("desktop", mode);
      expect(notices().map((n) => n.title)).toEqual([WELCOME_TITLE]);
      expect(welcomed()).toBe("1");
    },
  );

  it("says nothing before the boot reaches the desktop", () => {
    renderHook(() => useWelcome());
    expect(notices()).toHaveLength(0);
    expect(welcomed()).toBeNull();
  });

  it("says nothing over an open window, and keeps the flag", async () => {
    register({ id: "w" });
    open("w");
    renderHook(() => useWelcome());
    goTo("desktop");
    expect(notices()).toHaveLength(0);
    expect(welcomed()).toBeNull();

    // A later empty arrival in the same session is greeted.
    await act(async () => {
      await os.windows.closeWindow("w");
    });
    expect(useOS.getState().windows.items).toHaveLength(0);
    goTo("restarting");
    goTo("desktop");
    expect(notices().map((n) => n.title)).toEqual([WELCOME_TITLE]);
    expect(welcomed()).toBe("1");
  });

  it("greets once per session", () => {
    const { unmount } = renderHook(() => useWelcome());
    goTo("desktop");
    expect(notices()).toHaveLength(1);

    // Restart goes round to the desktop again.
    goTo("restarting");
    goTo("desktop");
    expect(notices()).toHaveLength(1);

    // So does a desktop that mounts again.
    unmount();
    renderHook(() => useWelcome());
    expect(notices()).toHaveLength(1);
    goTo("restarting");
    goTo("desktop");
    expect(notices()).toHaveLength(1);
  });

  it("says nothing when the session was already welcomed", () => {
    sessionStorage.setItem(WELCOMED_KEY, "1");
    renderHook(() => useWelcome());
    goTo("desktop");
    expect(notices()).toHaveLength(0);
  });

  it("points at the bottom in fullscreen mode", () => {
    act(() => {
      os.windows.setScreen({
        mode: "fullscreen",
        workArea: useOS.getState().windows.workArea,
      });
    });
    renderHook(() => useWelcome());
    goTo("desktop");
    expect(notices()[0].body).toBe(
      "Open Projects, Skills or About from the dock at the bottom.",
    );
  });

  it("greets once when Strict Mode mounts it on the desktop", () => {
    // The ?boot=skip path: the stage is already the desktop at mount, and
    // Strict Mode runs the effect twice.
    useOS.setState((s) => {
      s.boot.stage = "desktop";
    });
    renderHook(() => useWelcome(), { wrapper: StrictMode });
    expect(notices()).toHaveLength(1);
  });

  // Last in the file: the memory fallback is a module variable, and it stays
  // set for the rest of the file once storage has thrown.
  it("greets once per page load when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { unmount } = renderHook(() => useWelcome());
    goTo("desktop");
    expect(notices()).toHaveLength(1);

    unmount();
    renderHook(() => useWelcome());
    goTo("restarting");
    goTo("desktop");
    expect(notices()).toHaveLength(1);
  });
});
