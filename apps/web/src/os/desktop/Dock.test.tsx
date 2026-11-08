import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appLookup, dockApps } from "@/os/apps/registry";
import { Screen } from "@/os/screen/Screen";
import { os, useOS } from "@/os/store";
import { getIconRect } from "@/os/window/iconRect";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { Dock } from "./Dock";
import { dockMenu } from "./dock";

beforeEach(() => {
  setupBrowser();
  // setupBrowser installs a test lookup; these tests open the real apps.
  os.windows.setAppLookup(appLookup);
});
afterEach(teardownBrowser);

function mount() {
  return render(
    <Screen>
      <Dock />
    </Screen>,
  );
}

const q = (selector: string) => document.querySelector<HTMLElement>(selector);
const icon = (id: string) => q(`[data-dock-app="${id}"]`)!;
const dockButtons = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-dock-app]"));
const shell = () => useOS.getState().shell;
const win = (id: string) =>
  useOS.getState().windows.items.find((w) => w.id === id);
const focusedId = () =>
  [...useOS.getState().windows.items]
    .filter((w) => w.status === "open")
    .sort((a, b) => b.z - a.z)[0]?.id;
const click = (id: string) => fireEvent.click(icon(id));
const open = (id: string) => act(() => void os.windows.openApp(id));

/** jsdom has no layout, so a test gives the button the rect it wants. */
function stubRect(el: HTMLElement, rect: DOMRect) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue(rect);
}
const projectsRect = () => new DOMRect(6, 40, 52, 52);

describe("Dock", () => {
  it("has a button for each dock app, in dock order", () => {
    mount();
    const dock = screen.getByRole("navigation", { name: "Dock" });
    expect(dock).toBe(q("[data-dock]"));
    expect(document.querySelectorAll("[data-dock]")).toHaveLength(1);

    const names = dockButtons().map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Projects", "Skills", "About"]);
    expect(dockButtons().map((b) => b.dataset.dockApp)).toEqual(
      dockApps.map((a) => a.id),
    );
    for (const app of dockApps) {
      const img = icon(app.id).querySelector("img");
      expect(img?.getAttribute("src"), app.id).toBe(app.icon);
      expect(icon(app.id).tagName).toBe("BUTTON");
    }
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Projects", "Skills", "About", "Show Applications"]);
    expect(screen.queryByRole("button", { name: "Hello" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Open / })).toBeNull();
  });

  it("gives no icon to an app that is not in the dock, even while it runs", () => {
    mount();
    open("hello");
    expect(win("hello")).toBeDefined();
    expect(dockButtons()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Hello" })).toBeNull();
  });

  describe("the running dot", () => {
    it("is on an app while it has a window, minimised or not", async () => {
      mount();
      expect(document.querySelectorAll("[data-running]")).toHaveLength(0);

      open("projects");
      expect(
        dockButtons().filter((b) => b.hasAttribute("data-running")),
      ).toEqual([icon("projects")]);
      // The dot itself is decoration inside the running button only.
      expect(
        icon("projects").querySelector('span[aria-hidden="true"]'),
      ).not.toBe(null);
      expect(icon("skills").querySelector("span")).toBeNull();

      act(() => os.windows.minimizeWindow("projects"));
      expect(icon("projects").hasAttribute("data-running")).toBe(true);

      await act(() => os.windows.closeWindow("projects"));
      expect(document.querySelectorAll("[data-running]")).toHaveLength(0);
      expect(icon("projects").querySelector("span")).toBeNull();
    });
  });

  describe("the active tile", () => {
    it("is on the app that owns the focused window", () => {
      mount();
      const active = () =>
        dockButtons()
          .filter((b) => b.hasAttribute("data-active"))
          .map((b) => b.dataset.dockApp);
      expect(active()).toEqual([]);

      open("projects");
      expect(active()).toEqual(["projects"]);
      open("skills");
      expect(active()).toEqual(["skills"]);

      // A minimised window is not focused: the focus falls to the next one.
      act(() => os.windows.minimizeWindow("skills"));
      expect(active()).toEqual(["projects"]);
      act(() => os.windows.minimizeWindow("projects"));
      expect(active()).toEqual([]);
    });

    it("is on no icon while an app without one has the focus", () => {
      mount();
      open("projects");
      open("hello");
      expect(document.querySelectorAll("[data-active]")).toHaveLength(0);
    });
  });

  describe("clicks follow the rules", () => {
    it("opens, minimises and restores one app", () => {
      mount();
      click("projects");
      expect(win("projects")?.status).toBe("open");
      expect(focusedId()).toBe("projects");

      click("projects");
      expect(win("projects")?.status).toBe("minimized");

      click("projects");
      expect(win("projects")?.status).toBe("open");
      expect(focusedId()).toBe("projects");
      expect(useOS.getState().windows.items).toHaveLength(1);
    });

    it("focuses an app that is open but not on top, and leaves the other open", () => {
      mount();
      click("skills");
      click("projects");
      expect(focusedId()).toBe("projects");
      click("skills");
      // Skills was open and unfocused: one click raises it, and does not minimise.
      expect(focusedId()).toBe("skills");
      expect(win("skills")?.status).toBe("open");
      expect(win("projects")?.status).toBe("open");
    });
  });

  describe("the icon rect getter", () => {
    it("returns the button's rect while the dock is mounted", () => {
      mount();
      stubRect(icon("projects"), projectsRect());
      expect(getIconRect("projects")).toMatchObject({
        left: 6,
        top: 40,
        width: 52,
        height: 52,
      });
      // An app with no icon returns null, and its window fades in place.
      expect(getIconRect("hello")).toBeNull();
      expect(getIconRect("nope")).toBeNull();
    });

    it("is gone after unmount", () => {
      const view = mount();
      stubRect(icon("projects"), projectsRect());
      expect(getIconRect("projects")).not.toBeNull();
      view.unmount();
      expect(getIconRect("projects")).toBeNull();
    });
  });

  describe("right-click", () => {
    it("opens the menu beside the icon, on the edge that faces the screen", () => {
      mount();
      stubRect(icon("projects"), projectsRect());
      // false means the event was cancelled, so the browser's menu is not shown.
      expect(fireEvent.contextMenu(icon("projects"))).toBe(false);
      expect(shell().contextMenu).toMatchObject({ x: 58, y: 40 });
      expect(shell().contextMenu?.items.map((i) => i.id)).toEqual(
        dockMenu(useOS.getState(), dockApps[0]).map((i) => i.id),
      );
      expect(shell().contextMenu?.items.map((i) => i.id)).toEqual([
        "dock:unpin",
      ]);
    });

    it("ignores where the pointer was, so the keyboard opens it the same way", () => {
      mount();
      stubRect(icon("projects"), projectsRect());
      fireEvent.contextMenu(icon("projects"), { clientX: 300, clientY: 400 });
      expect(shell().contextMenu).toMatchObject({ x: 58, y: 40 });
    });

    it("lists Quit while the app has a window", () => {
      mount();
      open("projects");
      stubRect(icon("projects"), projectsRect());
      fireEvent.contextMenu(icon("projects"));
      expect(shell().contextMenu?.items.map((i) => i.id)).toEqual([
        "dock:unpin",
        "dock:quit",
      ]);
    });

    it("opens nothing on the dock's background, and cancels the browser's menu", () => {
      mount();
      expect(fireEvent.contextMenu(q("[data-dock]")!)).toBe(false);
      expect(shell().contextMenu).toBeNull();
    });
  });

  describe("Show Applications", () => {
    it("toggles Activities, and reports it in aria-expanded", () => {
      mount();
      const button = screen.getByRole("button", { name: "Show Applications" });
      const expanded = () => button.getAttribute("aria-expanded");
      expect(shell().activitiesOpen).toBe(false);
      expect(expanded()).toBe("false");

      fireEvent.click(button);
      expect(shell().activitiesOpen).toBe(true);
      expect(expanded()).toBe("true");

      fireEvent.click(button);
      expect(shell().activitiesOpen).toBe(false);
      expect(expanded()).toBe("false");
    });

    it("controls the App Grid", () => {
      mount();
      expect(
        screen
          .getByRole("button", { name: "Show Applications" })
          .getAttribute("aria-controls"),
      ).toBe("desktop-app-grid");
    });

    it("follows the store when something else toggles Activities", () => {
      mount();
      act(() => os.shell.setActivitiesOpen(true));
      expect(
        screen
          .getByRole("button", { name: "Show Applications" })
          .getAttribute("aria-expanded"),
      ).toBe("true");
    });

    it("is the last control of the dock", () => {
      mount();
      const buttons = screen.getAllByRole("button");
      expect(buttons[buttons.length - 1]).toBe(
        screen.getByRole("button", { name: "Show Applications" }),
      );
    });
  });

  describe("the side follows the mode", () => {
    it("is on the left in laptop mode", () => {
      mount();
      expect(q("[data-dock]")?.dataset.dockSide).toBe("left");
    });

    it("is at the bottom in fullscreen mode", () => {
      teardownBrowser();
      setupBrowser({ fullscreen: true });
      os.windows.setAppLookup(appLookup);
      mount();
      expect(q("[data-dock]")?.dataset.dockSide).toBe("bottom");
    });

    it("opens its menu from the icon's left edge in fullscreen mode", () => {
      teardownBrowser();
      setupBrowser({ fullscreen: true });
      os.windows.setAppLookup(appLookup);
      mount();
      stubRect(icon("projects"), projectsRect());
      expect(fireEvent.contextMenu(icon("projects"))).toBe(false);
      expect(shell().contextMenu).toMatchObject({ x: 6, y: 40 });
    });
  });
});
