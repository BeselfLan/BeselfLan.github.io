import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Screen } from "@/os/screen/Screen";
import { focusedWindow, os, useOS } from "@/os/store";
import { WindowLayer } from "@/os/window/WindowLayer";
import {
  chromeOf,
  register,
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { Desktop } from "./Desktop";
import { focusInto } from "./focusOrder";

// The desktop with two test windows, A and B (B opened last, so in front),
// whose content is buttons labelled "<id>-1", "<id>-2", and so on. jsdom never
// moves focus on Tab, so every move in these tests is the handler's: each
// press dispatches a keydown on the focused element, or on the body.

function content(id: string): ReactNode {
  if (id === "a" || id === "b") {
    return (
      <div>
        <button>{`${id}-1`}</button>
        <button>{`${id}-2`}</button>
      </div>
    );
  }
  if (id === "m") return <button>m-1</button>;
  if (id === "v") {
    // A video with native controls, last in its window. jsdom focuses only an
    // element with a tabindex, so it has one, as the browser's own is focusable.
    return (
      <div>
        <button>v-1</button>
        <video controls tabIndex={0} />
      </div>
    );
  }
  if (id === "x") {
    // What Tab must pass over: a disabled button, a negative tabindex, a box
    // that is not drawn, a hidden input, hidden and inert subtrees, before the
    // one real control. jsdom focuses inert elements, so only the filter keeps
    // x-inert out.
    return (
      <div>
        <button disabled>x-disabled</button>
        <button tabIndex={-1}>x-negative</button>
        <div style={{ display: "none" }}>
          <button>x-undrawn</button>
        </div>
        <input type="hidden" />
        <div hidden>
          <button>x-hidden</button>
        </div>
        <div inert>
          <button>x-inert</button>
        </div>
        <button>x-ok</button>
      </div>
    );
  }
  if (id === "r") {
    // A roving item: tabindex -1 and focused, as the Projects ring leaves one.
    return (
      <div>
        <button tabIndex={-1}>r-rove</button>
        <button>r-1</button>
        <button>r-2</button>
      </div>
    );
  }
  return null;
}

function mount() {
  return render(
    <Screen>
      <Desktop>
        <WindowLayer chromeOf={chromeOf} renderContent={content} />
      </Desktop>
    </Screen>,
  );
}

function open(...ids: string[]) {
  act(() => {
    for (const id of ids) os.windows.openApp(id);
  });
}

function press(over: KeyboardEventInit = {}, target?: Element): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    bubbles: true,
    cancelable: true,
    ...over,
  });
  act(() => {
    (target ?? document.activeElement ?? document.body).dispatchEvent(event);
  });
  return event;
}
const tab = () => press();
const shiftTab = () => press({ shiftKey: true });

const focusButton = (name: string) => {
  const button = screen.getByRole("button", { name, hidden: true });
  act(() => button.focus());
  return button;
};
const blurAll = () =>
  act(() => (document.activeElement as HTMLElement | null)?.blur());

const nameOf = (el: Element | null) =>
  el?.getAttribute("aria-label") ?? el?.textContent ?? "";

/** The group of an element: the bar, the dock, a window's id, the toasts. */
function groupOf(el: Element | null): string {
  if (!el) return "none";
  if (el.closest("[data-topbar]")) return "topbar";
  if (el.closest("[data-dock]")) return "dock";
  if (el.closest("[data-toasts]")) return "toasts";
  if (el.closest("[data-app-grid]")) return "grid";
  const frame = el.closest("[data-window-id]");
  return frame ? frame.getAttribute("data-window-id")! : "outside";
}

/** Tabs from `from` until `stop` says so, and returns the groups visited. */
function walk(stop: (el: Element | null) => boolean, limit = 60): string[] {
  const seen: string[] = [];
  for (let i = 0; i < limit; i++) {
    // Each Tab that moved the focus is the handler's: the browser must not
    // also move it.
    expect(tab().defaultPrevented, `Tab ${i + 1}`).toBe(true);
    seen.push(groupOf(document.activeElement));
    if (stop(document.activeElement)) break;
  }
  return seen;
}
const collapse = (list: string[]) =>
  list.filter((g, i) => i === 0 || g !== list[i - 1]);

const isActivities = (el: Element | null) => nameOf(el) === "Activities";

beforeEach(() => {
  setupBrowser();
  sessionStorage.clear();
  register(
    { id: "a" },
    { id: "b" },
    { id: "m" },
    { id: "x" },
    { id: "r" },
    { id: "v" },
  );
});
afterEach(() => {
  blurAll();
  teardownBrowser();
});

describe("useFocusOrder", () => {
  it("from nothing, Tab starts at the top bar, and Shift+Tab at the last control", () => {
    mount();
    open("a", "b");
    act(() => void os.notifications.push({ title: "Heads up" }));
    expect(document.querySelector("[data-toast]")).not.toBeNull();
    expect(document.activeElement).toBe(document.body);

    const first = tab();
    expect(first.defaultPrevented).toBe(true);
    expect(nameOf(document.activeElement)).toBe("Activities");

    blurAll();
    const last = shiftTab();
    expect(last.defaultPrevented).toBe(true);
    // The last control of the order is the toast's, so [data-toasts] is in it.
    expect(nameOf(document.activeElement)).toBe("Hide Heads up");
    expect(groupOf(document.activeElement)).toBe("toasts");
  });

  it("walks the top bar, the dock, then the windows by z", () => {
    mount();
    open("a", "b");
    expect(focusedWindow(useOS.getState())?.id).toBe("b");

    // The first Tab lands on Activities; the walk ends when it comes back.
    let presses = 0;
    const groups = walk((el) => ++presses > 1 && isActivities(el));
    // B is in front, so it comes first. The DOM has the windows before the
    // bar, and a z-ascending walk would give A before B.
    expect(collapse(groups)).toEqual(["topbar", "dock", "b", "a", "topbar"]);
  });

  it("walks backwards from the last control, window by window", () => {
    mount();
    open("a", "b");
    const groups: string[] = [];
    for (let i = 0; i < 60; i++) {
      shiftTab();
      groups.push(groupOf(document.activeElement));
      if (isActivities(document.activeElement)) break;
    }
    // From the body: A's last control first, since B is in front and A is
    // after it; then B, the dock, and the bar down to Activities.
    expect(collapse(groups)).toEqual(["a", "b", "dock", "topbar"]);
    expect(isActivities(document.activeElement)).toBe(true);

    // Shift+Tab from the first control wraps to the last.
    shiftTab();
    expect(nameOf(document.activeElement)).toBe("a-2");
  });

  it("raises a window it enters, and the walk still ends", () => {
    mount();
    open("a", "b");
    // Tab on from Activities, through B, into A.
    focusButton("Activities");
    while (groupOf(document.activeElement) !== "a") tab();
    // Entering A made it the focused window.
    expect(focusedWindow(useOS.getState())?.id).toBe("a");
    expect(nameOf(document.activeElement)).toBe("Minimise");

    // On to A's last control. From there Tab goes to Activities, not back into
    // B, which a z order recomputed after the raise would put after A.
    while (nameOf(document.activeElement) !== "a-2") tab();
    tab();
    expect(nameOf(document.activeElement)).toBe("Activities");
    expect(groupOf(document.activeElement)).toBe("topbar");
  });

  it("skips what cannot take focus", () => {
    mount();
    open("m", "x");
    act(() => os.windows.minimizeWindow("m"));
    const names: string[] = [];
    walk((el) => {
      names.push(nameOf(el));
      return names.length > 1 && isActivities(el);
    });

    expect(names).toContain("x-ok");
    for (const never of [
      "m-1",
      "x-disabled",
      "x-negative",
      "x-undrawn",
      "x-hidden",
      "x-inert",
    ]) {
      expect(names, never).not.toContain(never);
    }
    // The control after the undrawn button is reached: the walk is not stuck.
    expect(names.indexOf("x-ok")).toBeGreaterThan(-1);
  });

  it("steps over a button that is in no box, and does not get stuck", () => {
    mount();
    open("x");
    // The filter cannot see CSS, so x-undrawn passes it; jsdom refuses to
    // focus it, and the walk tries the next control.
    const names: string[] = [];
    walk((el) => {
      names.push(nameOf(el));
      return names.includes("x-ok");
    });
    expect(names[names.length - 1]).toBe("x-ok");
    expect(names).not.toContain("x-undrawn");
  });

  it("goes to the next control from a roving item", () => {
    mount();
    open("r");
    const rove = focusButton("r-rove");
    expect(rove.tabIndex).toBe(-1);

    tab();
    // Not the top bar: the roving item is inside a window of the walk.
    expect(nameOf(document.activeElement)).toBe("r-1");
    focusButton("r-rove");
    shiftTab();
    expect(nameOf(document.activeElement)).toBe("Close");
  });

  it("restarts the walk from a control of a minimised window", () => {
    mount();
    open("m", "a");
    focusButton("m-1");
    act(() => os.windows.minimizeWindow("m"));
    // m-1 is still the active element, and is in no group of the walk.
    expect(document.activeElement?.textContent).toBe("m-1");
    tab();
    expect(nameOf(document.activeElement)).toBe("Activities");
  });

  it("keeps Tab inside the open App Grid", () => {
    mount();
    open("a");
    act(() => os.shell.setActivitiesOpen(true));
    const grid = document.querySelector("[data-app-grid]")!;
    const tiles = [
      ...grid.querySelectorAll<HTMLElement>("[data-app-grid-tile]"),
    ];
    expect(tiles.length).toBeGreaterThan(1);
    const search = screen.getByRole("searchbox", { name: "Search apps" });
    const last = tiles[tiles.length - 1];

    act(() => last.focus());
    tab();
    expect(document.activeElement).toBe(search);

    shiftTab();
    expect(document.activeElement).toBe(last);

    // From outside the grid, Tab goes to its first control.
    focusButton("Activities");
    tab();
    expect(document.activeElement).toBe(search);
  });

  it("leaves other keys alone", () => {
    mount();
    open("a");
    const bar = focusButton("Activities");

    // Alt+Tab and Ctrl+Tab belong to the browser and the shortcuts.
    for (const over of [
      { altKey: true },
      { ctrlKey: true },
      { metaKey: true },
    ]) {
      const event = press(over);
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(bar);
    }

    // A Tab that something already handled.
    const handled = (e: Event) => e.preventDefault();
    bar.addEventListener("keydown", handled);
    press();
    bar.removeEventListener("keydown", handled);
    expect(document.activeElement).toBe(bar);

    // A menu or a popover handles its own Tab: the portal is not the desktop's.
    const inPortal = document.createElement("button");
    document.querySelector("[data-screen-portal]")!.append(inPortal);
    act(() => inPortal.focus());
    expect(press().defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(inPortal);

    // Nor is anything outside the screen.
    const outside = document.createElement("button");
    document.body.append(outside);
    act(() => outside.focus());
    expect(press().defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  describe("native media controls", () => {
    // The browser walks a <video controls>' own controls, which sit in a closed
    // shadow root: the page sees the <video> as the active element throughout,
    // sees no key there after the first Tab, and sees one focusin when focus
    // leaves, with the <video> as its relatedTarget. Open a (behind) and v (in
    // front); the browser then lands on Activities, which comes after the
    // windows in the DOM, and the desktop's order is what must win.
    const video = () => document.querySelector("video")!;

    function onVideo() {
      mount();
      open("a", "v");
      expect(focusedWindow(useOS.getState())?.id).toBe("v");
      act(() => video().focus());
      expect(document.activeElement).toBe(video());
    }
    // What the browser does when the Tab leaves the controls: a focusin on the
    // element it lands on, from the video. jsdom gives the same relatedTarget.
    const leaveTo = (name: string) => focusButton(name);
    const pointerDown = () =>
      act(() => {
        document.body.dispatchEvent(
          new Event("pointerdown", { bubbles: true }),
        );
      });

    it("leaves Tab on the video to the browser", () => {
      onVideo();
      const event = tab();
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(video());
      // Nor does Shift+Tab move it.
      const back = shiftTab();
      expect(back.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(video());
    });

    it("goes on to the next control in the desktop's order when focus leaves", () => {
      onVideo();
      tab();
      // The video is last in the front window, so the next control of the walk
      // is the first one of A, which is behind. The browser's own landing,
      // Activities, is not it.
      leaveTo("Activities");
      expect(groupOf(document.activeElement)).toBe("a");
      expect(nameOf(document.activeElement)).toBe("Minimise");
      expect(focusedWindow(useOS.getState())?.id).toBe("a");
    });

    it("waits for as long as the controls keep the focus", async () => {
      onVideo();
      tab();
      // Nothing the document sees happens while focus moves among the controls,
      // however long that takes: a timer that ends the wait would be too soon.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      leaveTo("Activities");
      expect(nameOf(document.activeElement)).toBe("Minimise");
    });

    it("goes back to the previous control with Shift+Tab", () => {
      onVideo();
      shiftTab();
      leaveTo("Activities");
      expect(nameOf(document.activeElement)).toBe("v-1");
    });

    it("ignores a focus that does not come from the video", () => {
      onVideo();
      tab();
      // A focusin from nowhere, or from another element, is not the way out.
      const activities = screen.getByRole("button", {
        name: "Activities",
        hidden: true,
      });
      act(() => {
        activities.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      });
      expect(document.activeElement).toBe(video());
      act(() => {
        activities.dispatchEvent(
          new FocusEvent("focusin", {
            bubbles: true,
            relatedTarget: screen.getByRole("button", {
              name: "v-1",
              hidden: true,
            }),
          }),
        );
      });
      expect(document.activeElement).toBe(video());
    });

    it("stops waiting at a click, which moves focus without Tab", () => {
      onVideo();
      tab();
      pointerDown();
      leaveTo("Activities");
      expect(nameOf(document.activeElement)).toBe("Activities");
      expect(focusedWindow(useOS.getState())?.id).toBe("v");
    });

    it("stops waiting at any key the document sees", () => {
      onVideo();
      tab();
      // Space on the video itself: focus is not in the controls any more.
      press({ key: " " }, video());
      leaveTo("Activities");
      expect(nameOf(document.activeElement)).toBe("Activities");
    });

    it("walks on from a video that took focus from the walk itself", () => {
      mount();
      open("a", "v");
      // Tab from v-1 lands on the video, as the walk does for any control, and
      // the next Tab is the browser's.
      focusButton("v-1");
      expect(tab().defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(video());
      expect(tab().defaultPrevented).toBe(false);
      leaveTo("Activities");
      expect(groupOf(document.activeElement)).toBe("a");
    });
  });

  it("stops on unmount", () => {
    // Every key and focus listener the desktop puts on the document comes off
    // again. The handler also checks its root, so a leaked listener would do
    // nothing visible after unmount: only the listener itself shows it.
    const added = vi.spyOn(document, "addEventListener");
    const removed = vi.spyOn(document, "removeEventListener");
    const { unmount } = mount();
    const mine = added.mock.calls
      .filter(
        ([type]) =>
          type === "keydown" || type === "focusin" || type === "pointerdown",
      )
      .map(([, listener]) => listener);
    expect(mine.length).toBeGreaterThanOrEqual(3);
    unmount();
    for (const listener of mine) {
      expect(removed.mock.calls.some(([, l]) => l === listener)).toBe(true);
    }

    expect(document.activeElement).toBe(document.body);
    const event = tab();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("focusInto", () => {
  it("returns to the control that last had focus in the window", () => {
    mount();
    open("a", "b");
    focusButton("b-2");
    focusButton("Activities");
    expect(groupOf(document.activeElement)).toBe("topbar");

    act(() => focusInto("b"));
    expect(nameOf(document.activeElement)).toBe("b-2");
  });

  it("falls back to the window's first control, its Minimise button", () => {
    mount();
    open("a", "b");
    focusButton("Activities");
    act(() => focusInto("a"));
    expect(nameOf(document.activeElement)).toBe("Minimise");
    expect(groupOf(document.activeElement)).toBe("a");
  });

  it("leaves focus alone when it is already inside", () => {
    mount();
    open("a", "b");
    const second = focusButton("a-2");
    act(() => focusInto("a"));
    expect(document.activeElement).toBe(second);
  });

  it("blurs a window it cannot enter, so typing does not go to the old one", () => {
    register({ id: "c", chrome: "none" });
    mount();
    open("a", "c");
    focusButton("a-1");
    expect(groupOf(document.activeElement)).toBe("a");

    act(() => focusInto("c"));
    expect(document.activeElement).toBe(document.body);
  });

  it("does nothing for a window that is not there", () => {
    mount();
    open("a");
    const first = focusButton("a-1");
    act(() => focusInto("nope"));
    expect(document.activeElement).toBe(first);
  });
});
