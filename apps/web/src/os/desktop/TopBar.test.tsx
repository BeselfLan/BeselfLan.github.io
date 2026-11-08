import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { topBar } from "@/os/apps/extensions";
import { appLookup, getApp } from "@/os/apps/registry";
import { Screen } from "@/os/screen/Screen";
import { os, useOS } from "@/os/store";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { MEDIA_POLL_MS } from "./mediaStatus";
import { TopBar } from "./TopBar";

// The network icon reads this variable through the mocked provider.
const mediaState = vi.hoisted(() => ({
  status: "unknown" as "unknown" | "online" | "offline",
}));
vi.mock("@/media/provider", () => ({
  media: {
    resolve: () => Promise.resolve(null),
    status: () => mediaState.status,
  },
}));

const unregisters: (() => void)[] = [];

beforeEach(() => {
  setupBrowser();
  // setupBrowser installs a test lookup; the real apps have the real names.
  os.windows.setAppLookup(appLookup);
  mediaState.status = "unknown";
});
afterEach(() => {
  // The tray registry is module level, so one test must not leak into the next.
  act(() => {
    for (const off of unregisters.splice(0)) off();
  });
  vi.useRealTimers();
  teardownBrowser();
});

function mount() {
  return render(
    <Screen>
      <TopBar />
    </Screen>,
  );
}

const q = (selector: string) => document.querySelector<HTMLElement>(selector);
const button = (name: string) => screen.getByRole("button", { name });
const expanded = (el: HTMLElement) => el.getAttribute("aria-expanded");
const focusedName = () => q("[data-focused-app]")?.textContent;
const shell = () => useOS.getState().shell;

describe("TopBar", () => {
  it("holds the buttons and the clock", () => {
    mount();
    const bar = q("[data-topbar]")!;
    expect(bar.contains(button("Activities"))).toBe(true);
    expect(bar.contains(button("System menu"))).toBe(true);
    expect(bar.contains(q("[data-clock]"))).toBe(true);
  });

  it("shows the date and the time in the clock", () => {
    mount();
    const spans = q("[data-clock]")!.querySelectorAll("span");
    expect(spans).toHaveLength(2);
    expect(spans[0].textContent).toMatch(
      /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}$/,
    );
    expect(spans[1].textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  describe("the focused app's name", () => {
    it("is empty with no window and follows the focus", () => {
      mount();
      expect(focusedName()).toBe("");

      act(() => void os.windows.openApp("hello"));
      expect(focusedName()).toBe(getApp("hello")!.name);

      act(() => void os.windows.openApp("about"));
      expect(focusedName()).toBe(getApp("about")!.name);
      expect(getApp("about")!.name).not.toBe(getApp("hello")!.name);

      // Not the first window opened: the focused one.
      act(() => os.windows.focusWindow("hello"));
      expect(focusedName()).toBe(getApp("hello")!.name);
    });

    it("is empty again when every window is minimised", () => {
      mount();
      act(() => void os.windows.openApp("hello"));
      act(() => void os.windows.openApp("about"));
      act(() => os.windows.minimizeWindow("hello"));
      act(() => os.windows.minimizeWindow("about"));
      expect(focusedName()).toBe("");
    });
  });

  it("drives Activities through the store", () => {
    mount();
    const activities = button("Activities");
    expect(expanded(activities)).toBe("false");

    fireEvent.click(activities);
    expect(shell().activitiesOpen).toBe(true);
    expect(expanded(activities)).toBe("true");

    act(() => os.shell.toggleActivities());
    expect(shell().activitiesOpen).toBe(false);
    expect(expanded(activities)).toBe("false");
  });

  describe("the popover triggers", () => {
    const triggers = [
      ["the clock", () => q("[data-clock]")!, "calendar"],
      ["the system menu", () => button("System menu"), "power"],
    ] as const;

    it.each(triggers)("%s toggles its popover in the store", (_, get, id) => {
      mount();
      const trigger = get();
      expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
      expect(expanded(trigger)).toBe("false");

      fireEvent.click(trigger);
      expect(shell().openPopover).toBe(id);
      expect(expanded(trigger)).toBe("true");

      fireEvent.click(trigger);
      expect(shell().openPopover).toBeNull();
      expect(expanded(trigger)).toBe("false");
    });

    it.each(triggers)("%s closes with the global Esc action", (_, get, id) => {
      mount();
      fireEvent.click(get());
      expect(shell().openPopover).toBe(id);

      act(() => os.shell.closeAll());
      expect(shell().openPopover).toBeNull();
      expect(expanded(get())).toBe("false");
    });

    it("moves from one popover to the other", () => {
      mount();
      fireEvent.click(q("[data-clock]")!);
      fireEvent.click(button("System menu"));
      expect(shell().openPopover).toBe("power");
      expect(expanded(q("[data-clock]")!)).toBe("false");
    });
  });

  describe("the popovers close", () => {
    // [label, trigger, store id, dialog name]
    const popovers = [
      [
        "the calendar",
        () => q("[data-clock]")!,
        "calendar",
        "Calendar and notifications",
      ],
    ] as const;
    const dialogNamed = (name: string) =>
      screen.queryByRole("dialog", { name });

    // fireEvent.click does not move focus in jsdom, so focus the trigger the
    // way a press does; the focus-return checks mean nothing without it.
    function open(get: () => HTMLElement, id: string, name: string) {
      const trigger = get();
      trigger.focus();
      fireEvent.click(trigger);
      expect(shell().openPopover).toBe(id);
      expect(dialogNamed(name)).not.toBeNull();
      return trigger;
    }

    it.each(popovers)(
      "%s closes on Esc and returns the focus",
      (_, get, id, name) => {
        mount();
        const trigger = open(get, id, name);
        fireEvent.keyDown(document.activeElement!, { key: "Escape" });
        expect(shell().openPopover).toBeNull();
        expect(dialogNamed(name)).toBeNull();
        expect(document.activeElement).toBe(trigger);
      },
    );

    it.each(popovers)("%s closes on a press outside", (_, get, id, name) => {
      mount();
      open(get, id, name);
      fireEvent.pointerDown(document.body);
      expect(shell().openPopover).toBeNull();
      expect(dialogNamed(name)).toBeNull();
    });

    it.each(popovers)(
      "%s closes on its own button and stays closed",
      (_, get, id, name) => {
        mount();
        const trigger = open(get, id, name);
        // A real press is a pointerdown and then a click. Without triggerRef
        // the pointerdown counts as outside, and the click reopens it.
        fireEvent.pointerDown(trigger);
        fireEvent.click(trigger);
        expect(shell().openPopover).toBeNull();
        expect(dialogNamed(name)).toBeNull();
      },
    );

    it.each(popovers)("%s stays open on a press inside", (_, get, id, name) => {
      mount();
      open(get, id, name);
      fireEvent.pointerDown(dialogNamed(name)!);
      expect(shell().openPopover).toBe(id);
      expect(dialogNamed(name)).not.toBeNull();
    });
  });

  describe("the network icon", () => {
    const status = () =>
      q("[data-network-status]")?.getAttribute("data-network-status");
    const strokes = () =>
      q("[data-network-status]")!.querySelectorAll("path, line").length;

    it.each(["unknown", "online", "offline"] as const)(
      "matches the media status %s",
      (value) => {
        mediaState.status = value;
        mount();
        expect(status()).toBe(value);
      },
    );

    it("draws a strike only when offline", () => {
      const strokesFor = (value: typeof mediaState.status): number => {
        mediaState.status = value;
        const { unmount } = mount();
        const n = strokes();
        unmount();
        return n;
      };
      const online = strokesFor("online");
      expect(strokesFor("offline")).toBe(online + 1);
      expect(strokesFor("unknown")).toBe(online);
    });

    it("reads the status again every 5 seconds", () => {
      expect(MEDIA_POLL_MS).toBe(5000);
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      mediaState.status = "online";
      mount();
      expect(status()).toBe("online");

      mediaState.status = "offline";
      act(() => void vi.advanceTimersByTime(MEDIA_POLL_MS - 1));
      expect(status()).toBe("online");
      act(() => void vi.advanceTimersByTime(1));
      expect(status()).toBe("offline");

      mediaState.status = "online";
      act(() => void vi.advanceTimersByTime(MEDIA_POLL_MS));
      expect(status()).toBe("online");
    });

    it("stops polling on unmount", () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const { unmount } = mount();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("registered tray items", () => {
    it("render before the built-in icons and go away when unregistered", () => {
      mount();
      let off = () => {};
      act(() => {
        off = topBar.registerTrayItem({
          id: "t",
          label: "Test",
          render: () => <span data-testid="tray-t" />,
        });
        unregisters.push(off);
      });
      const item = screen.getByTestId("tray-t");
      expect(q("[data-topbar]")!.contains(item)).toBe(true);
      expect(
        Boolean(
          item.compareDocumentPosition(button("System menu")) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ).toBe(true);

      act(() => off());
      expect(screen.queryByTestId("tray-t")).toBeNull();
    });

    it("follow the item order", () => {
      mount();
      act(() => {
        unregisters.push(
          topBar.registerTrayItem({
            id: "b",
            label: "B",
            order: 2,
            render: () => <span data-testid="tray-b" />,
          }),
          topBar.registerTrayItem({
            id: "a",
            label: "A",
            order: 1,
            render: () => <span data-testid="tray-a" />,
          }),
        );
      });
      const ids = [...document.querySelectorAll("[data-tray-item]")].map((el) =>
        el.getAttribute("data-tray-item"),
      );
      expect(ids).toEqual(["a", "b"]);
    });
  });

  it("shows a static battery at 87%", () => {
    mount();
    expect(button("System menu").textContent).toContain("87%");
  });

  describe("the slide-in", () => {
    it("starts above the screen", () => {
      mount();
      expect(q("[data-topbar]")!.style.transform).toContain("-32px");
    });

    it("starts in place when motion is reduced", () => {
      os.settings.update({ reducedMotion: "on" });
      mount();
      expect(q("[data-topbar]")!.style.transform).not.toContain("-32px");
    });
  });
});
