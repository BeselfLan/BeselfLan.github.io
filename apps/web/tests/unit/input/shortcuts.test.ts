import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installShortcuts, shortcuts } from "@/os/input/shortcuts";
import { focusedWindow, os, useOS } from "@/os/store";
import type { WindowApp } from "@/os/store/windows";

const def = (id: string): WindowApp => ({
  id,
  name: id,
  window: { width: 400, height: 300 },
  capabilities: { maximize: false },
  singleton: true,
});
const lookup = (id: string) => def(id);

const shell = () => useOS.getState().shell;
const focusedId = () => focusedWindow(useOS.getState())?.id ?? null;
const windowIds = () => useOS.getState().windows.items.map((w) => w.id);
const openWindows = (...ids: string[]) =>
  ids.forEach((id) => os.windows.openApp(id));

/** Dispatches a real KeyboardEvent. Bubbles from `target` up to window. */
function press(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = window,
  type: "keydown" | "keyup" = "keydown",
): KeyboardEvent {
  const e = new KeyboardEvent(type, {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(e);
  return e;
}
const release = (key: string, init: KeyboardEventInit = {}) =>
  press(key, init, window, "keyup");

let uninstall: () => void;
let cleanups: (() => void)[];
// Every registration goes through here, so afterEach can remove it: the
// registry is module state shared by the tests in this file.
function register(
  scope: string,
  combo: string,
  handler: (e: KeyboardEvent) => void,
): () => void {
  const off = shortcuts.register(scope, combo, handler);
  cleanups.push(off);
  return off;
}

beforeEach(() => {
  localStorage.clear();
  useOS.setState(useOS.getInitialState(), true);
  os.windows.setAppLookup(lookup);
  cleanups = [];
  uninstall = installShortcuts();
});
afterEach(() => {
  uninstall();
  cleanups.forEach((off) => off());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("the defaults", () => {
  it("Alt+F4 closes the focused window", () => {
    openWindows("a", "b");
    expect(focusedId()).toBe("b");
    const e = press("F4", { altKey: true });
    expect(windowIds()).toEqual(["a"]);
    expect(e.defaultPrevented).toBe(true);
  });

  it("Alt+F4 with no open window does nothing", () => {
    const writes = vi.fn();
    const stop = useOS.subscribe(writes);
    expect(() => press("F4", { altKey: true })).not.toThrow();
    expect(writes).not.toHaveBeenCalled();

    // A minimised window is not focused either.
    openWindows("a");
    os.windows.minimizeWindow("a");
    writes.mockClear();
    const e = press("F4", { altKey: true });
    expect(writes).not.toHaveBeenCalled();
    expect(windowIds()).toEqual(["a"]);
    // Nothing to close, so the key is left to the browser.
    expect(e.defaultPrevented).toBe(false);
    stop();
  });

  it("Super toggles Activities when released alone", () => {
    press("Meta", { metaKey: true });
    // Not on the press.
    expect(shell().activitiesOpen).toBe(false);
    release("Meta");
    expect(shell().activitiesOpen).toBe(true);
    press("Meta", { metaKey: true });
    release("Meta");
    expect(shell().activitiesOpen).toBe(false);
  });

  it("Super with another key does not toggle", () => {
    press("Meta", { metaKey: true });
    press("l", { metaKey: true });
    release("Meta");
    expect(shell().activitiesOpen).toBe(false);
    // The next clean tap still works.
    press("Meta", { metaKey: true });
    release("Meta");
    expect(shell().activitiesOpen).toBe(true);
  });

  it("a Super release with no press seen does nothing", () => {
    release("Meta");
    expect(shell().activitiesOpen).toBe(false);
  });

  it("Super still toggles from a text field", () => {
    const input = document.body.appendChild(document.createElement("input"));
    press("Meta", { metaKey: true }, input);
    release("Meta");
    expect(shell().activitiesOpen).toBe(true);
  });

  it("a blur disarms Super", () => {
    press("Meta", { metaKey: true });
    window.dispatchEvent(new Event("blur"));
    release("Meta");
    expect(shell().activitiesOpen).toBe(false);
  });

  it("Alt+Tab and Alt+Shift+Tab cycle focus", () => {
    openWindows("a", "b", "c");
    expect(focusedId()).toBe("c");
    const forward = press("Tab", { altKey: true });
    expect(focusedId()).toBe("b");
    expect(forward.defaultPrevented).toBe(true);
    const back = press("Tab", { altKey: true, shiftKey: true });
    expect(focusedId()).toBe("c");
    expect(back.defaultPrevented).toBe(true);
  });

  it("Esc closes Activities, the popover and the context menu", () => {
    os.shell.setActivitiesOpen(true);
    os.shell.setPopover("power");
    os.shell.openContextMenu(1, 2, []);
    press("Escape");
    expect(shell().activitiesOpen).toBe(false);
    expect(shell().openPopover).toBeNull();
    expect(shell().contextMenu).toBeNull();
  });

  it("an Esc that was already handled does nothing", () => {
    const child = document.body.appendChild(document.createElement("div"));
    child.addEventListener("keydown", (e) => e.preventDefault());
    os.shell.setPopover("power");
    press("Escape", {}, child);
    expect(shell().openPopover).toBe("power");
  });

  it("ignores a key during composition", () => {
    os.shell.setPopover("power");
    press("Escape", { isComposing: true });
    expect(shell().openPopover).toBe("power");
  });
});

describe("registered shortcuts", () => {
  it("an app-scoped shortcut fires only while its window is focused", () => {
    openWindows("a", "b");
    const h = vi.fn();
    register("a", "Ctrl+K", h);
    const miss = press("k", { ctrlKey: true });
    expect(h).not.toHaveBeenCalled();
    expect(miss.defaultPrevented).toBe(false);
    os.windows.focusWindow("a");
    const hit = press("k", { ctrlKey: true });
    expect(h).toHaveBeenCalledTimes(1);
    expect(hit.defaultPrevented).toBe(true);
  });

  it("a global shortcut fires whichever window is focused, or none", () => {
    const h = vi.fn();
    register("global", "Ctrl+J", h);
    press("j", { ctrlKey: true });
    openWindows("a");
    press("j", { ctrlKey: true });
    expect(h).toHaveBeenCalledTimes(2);
  });

  it("the focused window wins over global", () => {
    openWindows("a");
    os.shell.setPopover("power");
    const h = vi.fn();
    const global = vi.fn();
    register("a", "Escape", h);
    register("global", "Escape", global);
    press("Escape");
    expect(h).toHaveBeenCalledTimes(1);
    expect(global).not.toHaveBeenCalled();
    expect(shell().openPopover).toBe("power");
  });

  it("the newest registration in a scope wins, and unregistering restores the earlier one", () => {
    openWindows("a", "b");
    const first = vi.fn();
    const second = vi.fn();
    register("global", "Ctrl+M", first);
    const offSecond = register("global", "Ctrl+M", second);
    press("m", { ctrlKey: true });
    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([0, 1]);
    offSecond();
    press("m", { ctrlKey: true });
    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([1, 1]);
  });

  it("a registered Alt+Tab, before or after install, beats the default", () => {
    openWindows("a", "b");
    // After install (beforeEach installed already).
    const after = vi.fn();
    const offAfter = register("global", "Alt+Tab", after);
    press("Tab", { altKey: true });
    expect(after).toHaveBeenCalledTimes(1);
    expect(focusedId()).toBe("b");
    offAfter();
    press("Tab", { altKey: true });
    expect(focusedId()).toBe("a");

    // Before install: reinstall with the handler already registered.
    uninstall();
    os.windows.focusWindow("b");
    const before = vi.fn();
    const offBefore = register("global", "Alt+Tab", before);
    uninstall = installShortcuts();
    press("Tab", { altKey: true });
    expect(before).toHaveBeenCalledTimes(1);
    expect(focusedId()).toBe("b");
    offBefore();
    press("Tab", { altKey: true });
    expect(focusedId()).toBe("a");
  });

  it("unregistering twice is safe and removes only its own entry", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = register("global", "Ctrl+Q", a);
    register("global", "Ctrl+Q", b);
    offA();
    offA();
    press("q", { ctrlKey: true });
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([0, 1]);
  });

  it("combos match exactly", () => {
    const h = vi.fn();
    register("global", "Ctrl+K", h);
    press("k", { ctrlKey: true, shiftKey: true });
    press("k");
    press("k", { ctrlKey: true, altKey: true });
    expect(h).not.toHaveBeenCalled();
    press("k", { ctrlKey: true });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("spells a combo any way round, in any case", () => {
    const h = vi.fn();
    register("global", "SHIFT+alt+f", h);
    press("F", { altKey: true, shiftKey: true });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("matches a letter by its code when Alt changes the key", () => {
    const h = vi.fn();
    register("global", "Alt+K", h);
    press("˚", { altKey: true, code: "KeyK" });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("names Space and the plus key", () => {
    const space = vi.fn();
    const plus = vi.fn();
    register("global", "Ctrl+Space", space);
    register("global", "Ctrl++", plus);
    press(" ", { ctrlKey: true });
    press("+", { ctrlKey: true });
    expect([space.mock.calls.length, plus.mock.calls.length]).toEqual([1, 1]);
  });

  it("a registered Meta handler runs on the tap, instead of the default", () => {
    const h = vi.fn();
    register("global", "Meta", h);
    press("Meta", { metaKey: true });
    release("Meta");
    expect(h).toHaveBeenCalledTimes(1);
    expect(shell().activitiesOpen).toBe(false);
  });

  it("a bad combo throws", () => {
    for (const bad of ["Hyper+K", "", "Ctrl+", "Ctrl", "Alt+Meta", "Shift"]) {
      expect(() => shortcuts.register("global", bad, () => {})).toThrow();
    }
  });
});

describe("typing", () => {
  it("plain keys are ignored while typing", () => {
    const h = vi.fn();
    register("global", "k", h);
    const input = document.body.appendChild(document.createElement("input"));
    const area = document.body.appendChild(document.createElement("textarea"));
    const editable = document.body.appendChild(document.createElement("div"));
    editable.setAttribute("contenteditable", "true");
    const inner = editable.appendChild(document.createElement("span"));
    for (const field of [input, area, editable, inner]) press("k", {}, field);
    expect(h).not.toHaveBeenCalled();

    // contenteditable="false" is not a field, and neither is the page.
    const off = document.body.appendChild(document.createElement("div"));
    off.setAttribute("contenteditable", "false");
    press("k", {}, off);
    press("k");
    expect(h).toHaveBeenCalledTimes(2);
  });

  it("Escape from a field still closes things", () => {
    const input = document.body.appendChild(document.createElement("input"));
    os.shell.setPopover("power");
    press("Escape", {}, input);
    expect(shell().openPopover).toBeNull();
  });

  it("a chord still works from a field", () => {
    const h = vi.fn();
    register("global", "Ctrl+K", h);
    const input = document.body.appendChild(document.createElement("input"));
    press("k", { ctrlKey: true }, input);
    expect(h).toHaveBeenCalledTimes(1);
  });
});

describe("install", () => {
  it("uninstall removes the listeners", () => {
    openWindows("a");
    const h = vi.fn();
    register("global", "Ctrl+K", h);
    uninstall();
    press("F4", { altKey: true });
    press("k", { ctrlKey: true });
    press("Meta", { metaKey: true });
    release("Meta");
    expect(windowIds()).toEqual(["a"]);
    expect(h).not.toHaveBeenCalled();
    expect(shell().activitiesOpen).toBe(false);
  });

  it("listens on the target it is given", () => {
    uninstall();
    const other = new EventTarget() as unknown as Window;
    const off = installShortcuts(other);
    openWindows("a");
    press("F4", { altKey: true });
    expect(windowIds()).toEqual(["a"]);
    other.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F4",
        altKey: true,
        cancelable: true,
      }),
    );
    expect(windowIds()).toEqual([]);
    off();
  });
});
