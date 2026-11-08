import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Screen } from "@/os/screen/Screen";
import { os, useOS } from "@/os/store";
import type { MenuItem } from "@/os/ui/Menu";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { ContextMenuHost } from "./ContextMenuHost";

beforeEach(() => {
  setupBrowser();
});
afterEach(teardownBrowser);

function mount() {
  return render(
    <Screen>
      <ContextMenuHost />
    </Screen>,
  );
}

const menu = () => screen.queryByRole("menu");
const menuLabels = () =>
  screen.getAllByRole("menuitem").map((el) => el.textContent);
const contextMenu = () => useOS.getState().shell.contextMenu;
const popover = () => document.querySelector<HTMLElement>("[data-popover]");

function items(onSelect = vi.fn<() => void>()): MenuItem[] {
  return [
    { id: "a", label: "Alpha", onSelect },
    { id: "sep", separator: true },
    { id: "b", label: "Beta", onSelect },
    { id: "c", label: "Gamma", disabled: true, onSelect },
  ];
}

describe("ContextMenuHost renders shell.contextMenu", () => {
  it("renders nothing while there is no menu", () => {
    mount();
    expect(contextMenu()).toBeNull();
    expect(menu()).toBeNull();
    expect(popover()).toBeNull();
  });

  it("shows the labels of the items it was given", () => {
    mount();
    act(() => os.shell.openContextMenu(100, 50, items()));
    expect(menu()).not.toBeNull();
    expect(screen.getByRole("menu").getAttribute("aria-label")).toBe(
      "Context menu",
    );
    expect(menuLabels()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(screen.getAllByRole("separator")).toHaveLength(1);
    expect(
      screen.getByRole("menuitem", { name: "Gamma" }).hasAttribute("disabled"),
    ).toBe(true);
    // The Popover around it is a wrapper, not a dialog.
    expect(popover()?.getAttribute("role")).toBe("presentation");
  });

  it("calls the item's onSelect once and closes", () => {
    const onSelect = vi.fn<() => void>();
    mount();
    act(() => os.shell.openContextMenu(100, 50, items(onSelect)));
    fireEvent.click(screen.getByRole("menuitem", { name: "Beta" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(contextMenu()).toBeNull();
    expect(menu()).toBeNull();
  });

  it("does not choose a disabled item", () => {
    const onSelect = vi.fn<() => void>();
    mount();
    act(() => os.shell.openContextMenu(100, 50, items(onSelect)));
    fireEvent.click(screen.getByRole("menuitem", { name: "Gamma" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes on Esc without calling any onSelect", () => {
    const onSelect = vi.fn<() => void>();
    mount();
    act(() => os.shell.openContextMenu(100, 50, items(onSelect)));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(contextMenu()).toBeNull();
    expect(menu()).toBeNull();
  });

  it("closes when the shell closes everything, as the global Esc does", () => {
    const onSelect = vi.fn<() => void>();
    mount();
    act(() => os.shell.openContextMenu(100, 50, items(onSelect)));
    expect(menu()).not.toBeNull();
    act(() => os.shell.closeAll());
    expect(menu()).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes on a press outside it", () => {
    mount();
    act(() => os.shell.openContextMenu(100, 50, items()));
    fireEvent.pointerDown(document.body);
    expect(contextMenu()).toBeNull();
    expect(menu()).toBeNull();
  });

  it("shows the newest menu when another one opens", () => {
    mount();
    act(() => os.shell.openContextMenu(100, 50, items()));
    act(() =>
      os.shell.openContextMenu(300, 80, [
        { id: "z", label: "Zeta", onSelect: () => {} },
      ]),
    );
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(menuLabels()).toEqual(["Zeta"]);
  });
});

describe("ContextMenuHost placement", () => {
  // jsdom has no layout. The portal target is the 900 unit screen, and the
  // popover is a 120 x 80 box.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.hasAttribute("data-screen-portal") ? 900 : 80;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.hasAttribute("data-screen-portal") ? 1440 : 120;
      },
    );
  });

  it("opens downwards from a point in the upper half", () => {
    mount();
    act(() => os.shell.openContextMenu(100, 200, items()));
    // Scale 1 in jsdom: the top edge is at the point, plus the 4 unit gap.
    expect(popover()?.style.left).toBe("100px");
    expect(popover()?.style.top).toBe("204px");
  });

  it("opens upwards from a point in the lower half, clear of the point", () => {
    mount();
    act(() => os.shell.openContextMenu(100, 700, items()));
    // 700 - 80 (its height) - 4 (the gap): its bottom edge is above the point.
    expect(popover()?.style.left).toBe("100px");
    expect(popover()?.style.top).toBe("616px");
  });

  it("treats the middle row as the upper half", () => {
    mount();
    act(() => os.shell.openContextMenu(100, 450, items()));
    expect(popover()?.style.top).toBe("454px");
  });

  it("flips when a menu moves from one half to the other", () => {
    mount();
    act(() => os.shell.openContextMenu(100, 200, items()));
    expect(popover()?.style.top).toBe("204px");
    act(() => os.shell.openContextMenu(100, 800, items()));
    expect(popover()?.style.top).toBe("716px");
  });
});
