import { beforeEach, describe, expect, it } from "vitest";
import { os, useOS } from "@/os/store";

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
    const items = [{ label: "a" }];
    os.shell.openContextMenu(10, 20, items);
    const menu = useOS.getState().shell.contextMenu;
    expect(menu?.x).toBe(10);
    expect(menu?.y).toBe(20);
    expect(menu?.items).toEqual(items);
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
