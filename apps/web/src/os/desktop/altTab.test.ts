// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { WindowState } from "../store/windows";
import { firstIndex, nextIndex, switcherOrder } from "./altTab";

const win = (
  id: string,
  z: number,
  status: WindowState["status"] = "open",
): WindowState => ({
  id,
  appId: id,
  args: undefined,
  title: id,
  position: { x: 0, y: 0 },
  size: { width: 100, height: 100 },
  status,
  maximized: false,
  alwaysOnTop: false,
  z,
  openedAt: 0,
});

const ids = (list: readonly WindowState[]) => list.map((w) => w.id);

describe("switcherOrder", () => {
  it("lists the focused window first, then the rest by z, minimised included", () => {
    // z values that are not in id order, so a list left in `items` order fails.
    const items = [win("b", 2), win("c", 9, "minimized"), win("a", 5)];
    // c was minimised and keeps its z, so a plain sort would give c, a, b.
    // cycleFocus would skip c and give a, b.
    expect(ids(switcherOrder(items))).toEqual(["a", "c", "b"]);
  });

  it("is the z order, highest first, when every window is open", () => {
    const items = [win("a", 3), win("b", 7), win("c", 1)];
    expect(ids(switcherOrder(items))).toEqual(["b", "a", "c"]);
  });

  it("is the z order, highest first, when every window is minimised", () => {
    const items = [
      win("a", 3, "minimized"),
      win("b", 7, "minimized"),
      win("c", 1, "minimized"),
    ];
    expect(ids(switcherOrder(items))).toEqual(["b", "a", "c"]);
  });

  it("is empty with no windows, and does not change its input", () => {
    expect(switcherOrder([])).toEqual([]);
    const items = [win("a", 1), win("b", 2)];
    const copy = [...items];
    switcherOrder(items);
    expect(items).toEqual(copy);
  });
});

describe("nextIndex", () => {
  it("steps and wraps both ways", () => {
    expect(nextIndex(0, 3, 1)).toBe(1);
    expect(nextIndex(2, 3, 1)).toBe(0);
    expect(nextIndex(0, 3, -1)).toBe(2);
    expect(nextIndex(2, 3, -1)).toBe(1);
    expect(nextIndex(0, 1, 1)).toBe(0);
    expect(nextIndex(0, 1, -1)).toBe(0);
  });

  it("copes with an empty list and an index past the end", () => {
    expect(nextIndex(0, 0, 1)).toBe(0);
    expect(nextIndex(5, 3, 1)).toBe(0);
  });
});

describe("firstIndex", () => {
  it("skips the focused window when there is one", () => {
    expect(firstIndex(3, true, 1)).toBe(1);
    expect(firstIndex(3, true, -1)).toBe(2);
    // One window: the strip shows it, and a release focuses it.
    expect(firstIndex(1, true, 1)).toBe(0);
  });

  it("starts at the end it came from when no window is focused", () => {
    expect(firstIndex(3, false, 1)).toBe(0);
    expect(firstIndex(3, false, -1)).toBe(2);
  });

  it("is 0 for an empty list", () => {
    expect(firstIndex(0, false, 1)).toBe(0);
    expect(firstIndex(0, true, -1)).toBe(0);
  });
});
