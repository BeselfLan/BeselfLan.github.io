import { act, render, screen } from "@testing-library/react";
import { content } from "@beself/content";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { showsDesktop } from "@/os/boot/BootSequence";
import { BOOT_STAGES } from "@/os/boot/stages";
import { os, useOS } from "@/os/store";
import { setupBrowser, teardownBrowser } from "../window/mountLayer";

// The whole page, with the real registry. useKernel replaces the test lookup
// that setupBrowser installs. Only the timers that the stub boot clock uses
// are faked, so the lazy import of an app and findBy keep running.

const stage = () => useOS.getState().boot.stage;
const items = () => useOS.getState().windows.items;
const desktop = () => document.querySelector("[data-desktop]");

/** Each stage sets the next timer in an effect, so one flush moves one stage. */
function toDesktop(): void {
  for (let i = 0; i < 20 && stage() !== "desktop"; i++) {
    act(() => {
      vi.runOnlyPendingTimers();
    });
  }
  expect(stage()).toBe("desktop");
}

function altF4(): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "F4",
      altKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}

beforeEach(() => {
  setupBrowser();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  // The tests unmount the page themselves, so the shortcut listeners and the
  // URL sync go away even before the global cleanup runs.
  vi.useRealTimers();
  teardownBrowser();
});

describe("the page", () => {
  it("boot screen first, desktop after the boot", () => {
    const { unmount } = render(<Home />);
    expect(
      screen.getByRole("heading", { level: 1, name: /BeselfOS/ }),
    ).toBeTruthy();
    // The stub clock has started the boot, and no desktop is mounted yet.
    expect(stage()).not.toBe("off");
    expect(document.querySelector("[data-boot-stage]")).not.toBeNull();
    expect(desktop()).toBeNull();

    toDesktop();
    expect(desktop()).not.toBeNull();
    expect(document.querySelector("[data-boot-stage]")).toBeNull();
    unmount();
  });

  it("the desktop goes away in a boot stage", () => {
    const { unmount } = render(<Home />);
    toDesktop();
    expect(desktop()).not.toBeNull();

    act(() => os.boot.restart());
    expect(stage()).toBe("restarting");
    expect(desktop()).toBeNull();
    expect(
      document.querySelector('[data-boot-stage="restarting"]'),
    ).not.toBeNull();

    // The restart plays a full boot and the desktop comes back.
    toDesktop();
    expect(desktop()).not.toBeNull();
    unmount();
  });

  it("windows render inside the desktop", async () => {
    const { unmount } = render(<Home />);
    toDesktop();
    // findBy ends with a setTimeout that fake timers would hold forever.
    vi.useRealTimers();
    act(() => void os.windows.openApp("hello"));
    const heading = await screen.findByRole(
      "heading",
      { name: "Hello, world" },
      { timeout: 5000 },
    );
    expect(heading.closest("[data-desktop]")).not.toBeNull();
    expect(
      heading.closest("[data-window-id]")?.getAttribute("data-window-id"),
    ).toBe("hello");
    unmount();
  });

  it("the keyboard works only on the desktop", () => {
    const { unmount } = render(<Home />);
    toDesktop();
    act(() => void os.windows.openApp("hello"));

    act(() => os.boot.restart());
    expect(stage()).toBe("restarting");
    altF4();
    expect(items().map((w) => w.id)).toEqual(["hello"]);

    toDesktop();
    altF4();
    expect(items()).toHaveLength(0);
    unmount();
  });

  it("installs one keyboard, not two", () => {
    const { unmount } = render(<Home />);
    toDesktop();
    // Two open windows: a doubled handler would close both on one press.
    act(() => void os.windows.openApp("hello"));
    act(() => void os.windows.openApp("about"));
    altF4();
    expect(items().map((w) => w.id)).toEqual(["hello"]);
    unmount();
  });

  it("a deep link on load opens its app", () => {
    window.history.replaceState(null, "", "/?app=skills&item=python");
    const { unmount } = render(<Home />);
    expect(items().map((w) => w.id)).toEqual(["skills"]);
    expect(items()[0].args).toEqual({ item: "python" });
    // Opening it did not rewrite the URL; the window is the URL's own.
    expect(window.location.search).toBe("?app=skills&item=python");
    unmount();
  });

  it("the URL follows the focused window", () => {
    window.history.replaceState(null, "", "/?boot=full&app=hello&name=Ann");
    const { unmount } = render(<Home />);
    expect(items()[0].args).toEqual({ name: "Ann" });

    act(() => void os.windows.openApp("about"));
    expect(window.location.search).toBe("?app=about");
    act(() => void os.windows.closeWindow("about"));
    expect(window.location.search).toBe("?app=hello&name=Ann");
    act(() => void os.windows.closeWindow("hello"));
    expect(window.location.search).toBe("");
    unmount();
  });

  it("ignores a link it cannot open", () => {
    window.history.replaceState(null, "", "/?app=nope");
    const error = vi.spyOn(console, "error");
    const { unmount } = render(<Home />);
    toDesktop();
    expect(items()).toHaveLength(0);
    expect(error).not.toHaveBeenCalled();
    unmount();
  });
});

describe("showsDesktop", () => {
  it("is true only for desktop-enter, desktop and shutting-down", () => {
    const shown = (Object.keys(BOOT_STAGES) as (keyof typeof BOOT_STAGES)[])
      .filter(showsDesktop)
      .sort();
    expect(shown).toEqual(["desktop", "desktop-enter", "shutting-down"]);
  });
});

describe("the workspace", () => {
  it("links the content workspace package", () => {
    expect(typeof content).toBe("object");
  });
});
