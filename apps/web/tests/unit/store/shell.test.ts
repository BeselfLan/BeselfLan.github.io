import { beforeEach, describe, expect, it } from "vitest";
import { os, useOS } from "@/os/store";
import type { MenuItem } from "@/os/ui/Menu";

beforeEach(() => {
  useOS.setState(useOS.getInitialState(), true);
});

describe("shell", () => {
  it("fields match 2.2", () => {
    expect(useOS.getState().shell).toEqual({
      activitiesOpen: false,
      openPopover: null,
      contextMenu: null,
      altTabIndex: 0,
    });
  });

  it("exposes the shell actions", () => {
    expect(Object.keys(os.shell).sort()).toEqual([
      "closeAll",
      "closeContextMenu",
      "openContextMenu",
      "setActivitiesOpen",
      "setAltTabIndex",
      "setPopover",
      "toggleActivities",
    ]);
  });

  it("openContextMenu keeps coordinates apart", () => {
    const items: MenuItem[] = [{ id: "a", label: "A", onSelect: () => {} }];
    os.shell.openContextMenu(10, 20, items);
    const menu = useOS.getState().shell.contextMenu;
    expect(menu?.x).toBe(10);
    expect(menu?.y).toBe(20);
    expect(menu?.items).toEqual(items);
  });

  it("openContextMenu takes MenuItems", () => {
    // Checked by npm run typecheck: without the narrowing this directive is
    // unused, and tsc reports that.
    // @ts-expect-error a row without an id and a label is not a MenuItem
    os.shell.openContextMenu(1, 2, [{ nope: true }]);
    const separator: MenuItem = { id: "s", separator: true };
    os.shell.openContextMenu(1, 2, [separator]);
    expect(useOS.getState().shell.contextMenu?.items).toEqual([separator]);
  });

  it("the menu position is stored as given", () => {
    // Client px (plan 3.4), so fractions from a pointer event are kept.
    os.shell.openContextMenu(300.5, 200.25, []);
    const menu = useOS.getState().shell.contextMenu;
    expect(menu?.x).toBe(300.5);
    expect(menu?.y).toBe(200.25);
  });

  it("closeAll closes everything and leaves altTabIndex", () => {
    os.shell.setActivitiesOpen(true);
    os.shell.setPopover("power");
    os.shell.openContextMenu(1, 2, []);
    os.shell.setAltTabIndex(2);
    os.shell.closeAll();
    const s = useOS.getState().shell;
    expect(s.activitiesOpen).toBe(false);
    expect(s.openPopover).toBeNull();
    expect(s.contextMenu).toBeNull();
    expect(s.altTabIndex).toBe(2);
  });

  it("toggleActivities flips", () => {
    os.shell.toggleActivities();
    expect(useOS.getState().shell.activitiesOpen).toBe(true);
    os.shell.toggleActivities();
    expect(useOS.getState().shell.activitiesOpen).toBe(false);
  });

  it("closeContextMenu clears only the menu", () => {
    os.shell.setPopover("calendar");
    os.shell.openContextMenu(1, 2, []);
    os.shell.closeContextMenu();
    expect(useOS.getState().shell.contextMenu).toBeNull();
    expect(useOS.getState().shell.openPopover).toBe("calendar");
  });
});
