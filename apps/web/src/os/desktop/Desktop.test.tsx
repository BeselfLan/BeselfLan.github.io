import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { staticContent } from "@/content/static";
import { Screen } from "@/os/screen/Screen";
import { os, useOS } from "@/os/store";
import { FakeResizeObserver } from "../../../tests/unit/helpers/browser";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { Desktop } from "./Desktop";

function mount() {
  return render(
    <Screen>
      <Desktop>
        <div data-testid="layer" />
      </Desktop>
    </Screen>,
  );
}

const q = (selector: string) => document.querySelector<HTMLElement>(selector);
const menu = () => useOS.getState().shell.contextMenu;
const DESKTOP_LABELS = [
  "Change Background...",
  "Display Settings",
  "Open in Terminal",
];
const labelsOf = (items: readonly { id: string; label?: string }[] = []) =>
  items.map((i) => i.label);

/** True when `b` comes after `a` in document order. */
const before = (a: Element, b: Element): boolean =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("Desktop", () => {
  beforeEach(() => {
    setupBrowser();
    // setupBrowser clears localStorage only, and the welcome's flag is in
    // sessionStorage.
    sessionStorage.clear();
  });
  afterEach(teardownBrowser);

  it("follows the wallpaper setting", () => {
    mount();
    const image = () => q("[data-wallpaper]")?.style.backgroundImage;
    expect(q('[data-wallpaper="aubergine"]')).not.toBeNull();
    expect(image()).toBe('url("/wallpapers/aubergine.svg")');

    act(() => os.settings.update({ wallpaper: "orange" }));
    expect(q('[data-wallpaper="orange"]')).not.toBeNull();
    expect(image()).toBe('url("/wallpapers/orange.svg")');

    act(() => os.settings.update({ wallpaper: "mono" }));
    expect(q('[data-wallpaper="mono"]')).not.toBeNull();
    expect(image()).toBe('url("/wallpapers/mono.svg")');
    expect(document.querySelectorAll("[data-wallpaper]")).toHaveLength(1);
  });

  it("puts the windows between the wallpaper and the top bar", () => {
    mount();
    expect(document.querySelectorAll('[data-testid="layer"]')).toHaveLength(1);
    const layer = q('[data-testid="layer"]')!;
    const wallpaper = q("[data-wallpaper]")!;
    const signature = q("[data-signature]")!;
    expect(before(wallpaper, layer)).toBe(true);
    expect(before(signature, layer)).toBe(true);
    // The layer is isolate: a bar placed before it would paint under the windows.
    expect(before(layer, q("[data-topbar]")!)).toBe(true);
    expect(document.querySelectorAll("[data-topbar]")).toHaveLength(1);

    // The root adds nothing to the stacking: the layer is isolate, and a
    // z-index or isolate here would change what paints above the windows.
    const root = wallpaper.parentElement!;
    expect(root.contains(layer)).toBe(true);
    expect(root.style.zIndex).toBe("");
    expect(root.className).not.toMatch(/(^|\s)(isolate|-?z-\S+)/);
  });

  it("the stub launcher is gone", () => {
    mount();
    expect(q('nav[aria-label="Apps"]')).toBeNull();
    expect(screen.queryAllByRole("button", { name: /^Open / })).toHaveLength(0);
  });

  it("the dock paints above the windows", () => {
    mount();
    expect(document.querySelectorAll("[data-dock]")).toHaveLength(1);
    const layer = q('[data-testid="layer"]')!;
    const dock = q("[data-dock]")!;
    // The layer is isolate: a dock placed before it would paint under the windows.
    expect(before(layer, dock)).toBe(true);
    expect(before(q("[data-topbar]")!, dock)).toBe(true);
    // It is in the root with the rest, not nested in the layer.
    expect(layer.contains(dock)).toBe(false);
    expect(dock.parentElement).toBe(layer.parentElement);
  });

  it("opens the context menu from the store", () => {
    mount();
    expect(screen.queryByRole("menu")).toBeNull();
    act(() =>
      os.shell.openContextMenu(100, 50, [
        { id: "x", label: "Something", onSelect: () => {} },
      ]),
    );
    expect(screen.getByRole("menu")).not.toBeNull();
  });

  it("puts the App Grid after the dock, and both buttons control it", () => {
    mount();
    const grid = q("#desktop-app-grid")!;
    expect(grid).not.toBeNull();
    expect(document.querySelectorAll("[data-app-grid]")).toHaveLength(1);
    expect(grid.hasAttribute("data-app-grid")).toBe(true);
    expect(grid.hidden).toBe(true);
    // The layer is isolate: a grid placed before it would paint under the windows.
    expect(before(q('[data-testid="layer"]')!, grid)).toBe(true);
    expect(before(q("[data-topbar]")!, grid)).toBe(true);
    // After the dock, so it paints over it; in the root with the rest.
    expect(before(q("[data-dock]")!, grid)).toBe(true);
    expect(grid.parentElement).toBe(q('[data-testid="layer"]')!.parentElement);

    for (const name of ["Activities", "Show Applications"]) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("aria-controls"), name).toBe(grid.id);
    }
  });

  it("puts the toasts between the dock and the grid", () => {
    mount();
    expect(document.querySelectorAll("[data-toasts]")).toHaveLength(1);
    const toasts = q("[data-toasts]")!;
    // After the dock, so a toast paints over it, and before the grid, which is
    // modal and paints over the toasts. In the root with the rest.
    expect(before(q("[data-dock]")!, toasts)).toBe(true);
    expect(before(toasts, q("#desktop-app-grid")!)).toBe(true);
    expect(before(q('[data-testid="layer"]')!, toasts)).toBe(true);
    expect(toasts.parentElement).toBe(
      q('[data-testid="layer"]')!.parentElement,
    );
  });

  it("shows a pushed notification as a toast", () => {
    mount();
    act(() => void os.notifications.push({ title: "Hi", body: "there" }));
    expect(q("[data-toast]")?.textContent).toContain("Hi");
    expect(q("[data-toast]")?.textContent).toContain("there");
  });

  it("greets once the boot reaches the desktop", () => {
    // The skip path: the boot is already at the desktop when it mounts.
    useOS.setState((s) => {
      s.boot.stage = "desktop";
    });
    mount();
    const toasts = [...document.querySelectorAll("[data-toast]")];
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toContain("Welcome to BeselfOS");
    expect(toasts[0].textContent).toContain(
      "Open Projects, Skills or About from the dock on the left.",
    );
    expect(sessionStorage.getItem("beselfos:welcomed")).toBe("1");
  });

  it("does not greet before the boot reaches the desktop", () => {
    mount();
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(0);
    expect(useOS.getState().notifications.items).toHaveLength(0);

    // The desktop mounts during desktop-enter, and greets when the stage
    // changes to the desktop.
    act(() =>
      useOS.setState((s) => {
        s.boot.stage = "desktop-enter";
      }),
    );
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(0);
    act(() =>
      useOS.setState((s) => {
        s.boot.stage = "desktop";
      }),
    );
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(1);
  });

  it("opens the grid from Activities and Show Applications", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Activities" }));
    expect(q("#desktop-app-grid")!.hidden).toBe(false);
    expect(screen.getByRole("dialog", { name: "Applications" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Activities" }));
    expect(q("#desktop-app-grid")!.hidden).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Show Applications" }));
    expect(q("#desktop-app-grid")!.hidden).toBe(false);
  });

  describe("the desktop menu", () => {
    it("opens on a right-click on the wallpaper, at the pointer in client px", () => {
      mount();
      // The screen at half size, so a point converted to screen units would
      // read 600 and 400 and not 300 and 200 (jsdom has no layout, so the box
      // starts at 0,0).
      act(() => FakeResizeObserver.last.trigger(720, 450));
      expect(q("[data-screen-box]")!.style.getPropertyValue("--s")).toBe("0.5");

      const wallpaper = q("[data-wallpaper]")!;
      // False: preventDefault was called, so the browser's menu stays shut.
      expect(
        fireEvent.contextMenu(wallpaper, { clientX: 300, clientY: 200 }),
      ).toBe(false);
      expect(menu()).toMatchObject({ x: 300, y: 200 });
      expect(labelsOf(menu()?.items)).toEqual(DESKTOP_LABELS);
      expect(screen.getByRole("menu")).not.toBeNull();

      // Nothing inside the windows layer opens it.
      act(() => os.shell.closeContextMenu());
      expect(
        fireEvent.contextMenu(q('[data-testid="layer"]')!, {
          clientX: 300,
          clientY: 200,
        }),
      ).toBe(true);
      expect(menu()).toBeNull();
    });

    it("is left to the top bar and the dock", () => {
      mount();
      fireEvent.contextMenu(q("[data-topbar]")!);
      expect(menu()).toBeNull();
      // The dock cancels the browser's menu and opens nothing of the desktop's.
      fireEvent.contextMenu(q("[data-dock]")!);
      expect(menu()).toBeNull();
    });

    it("runs its items: Change Background... moves the wallpaper", () => {
      mount();
      expect(q('[data-wallpaper="aubergine"]')).not.toBeNull();
      fireEvent.contextMenu(q("[data-wallpaper]")!, {
        clientX: 300,
        clientY: 200,
      });
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Change Background..." }),
      );
      expect(q('[data-wallpaper="orange"]')).not.toBeNull();
      expect(menu()).toBeNull();
    });

    it("opens from Shift+F10 with nothing focused, at the middle of the screen", () => {
      mount();
      vi.spyOn(
        q("[data-screen-portal]")!,
        "getBoundingClientRect",
      ).mockReturnValue(new DOMRect(100, 50, 400, 300));
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        document.body.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
      expect(menu()).toMatchObject({ x: 300, y: 200 });
      expect(labelsOf(menu()?.items)).toEqual(DESKTOP_LABELS);
      // The menu takes focus, so the keyboard can use it.
      expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    });

    it("leaves a contextmenu on the body that was already handled", () => {
      mount();
      const handled = (e: Event) => e.preventDefault();
      document.body.addEventListener("contextmenu", handled);
      act(() => {
        document.body.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
        );
      });
      document.body.removeEventListener("contextmenu", handled);
      expect(menu()).toBeNull();
    });

    it("stops listening on the body when the desktop unmounts", () => {
      const { unmount } = mount();
      const dispatch = () => {
        const event = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
        });
        act(() => {
          document.body.dispatchEvent(event);
        });
        return event;
      };
      expect(dispatch().defaultPrevented).toBe(true);
      expect(menu()).not.toBeNull();

      act(() => os.shell.closeContextMenu());
      unmount();
      const after = dispatch();
      expect(menu()).toBeNull();
      expect(after.defaultPrevented).toBe(false);
    });
  });

  describe("the signature", () => {
    it("shows the name and tagline from the content package", () => {
      mount();
      const signature = q("[data-signature]")!;
      const { name, tagline } = staticContent.profile();
      expect(signature.textContent).toContain(name);
      expect(signature.textContent).toContain(tagline);
      // Real text, and the desktop's right-click must reach what is under it.
      expect(signature.closest("[aria-hidden=true]")).toBeNull();
      expect(signature.className).toContain("pointer-events-none");
    });

    it("sits 24 px from the bottom in laptop mode", () => {
      mount();
      expect(q("[data-signature]")!.style.bottom).toBe("24px");
    });

    it("rises to 88 px in fullscreen mode, above the bottom dock", () => {
      teardownBrowser();
      setupBrowser({ fullscreen: true });
      mount();
      expect(q("[data-signature]")!.style.bottom).toBe("88px");
    });
  });
});
