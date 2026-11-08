import { describe, expect, it } from "vitest";
import {
  place,
  type Align,
  type AnchorRect,
  type Side,
} from "@/os/ui/placement";

const anchor: AnchorRect = { left: 300, top: 200, width: 40, height: 20 };
const size = { width: 200, height: 100 };
const bounds = { width: 1440, height: 900 };

describe("place", () => {
  it.each<[Side, Align, number, number]>([
    ["bottom", "start", 300, 224],
    ["top", "start", 300, 96],
    ["right", "start", 344, 200],
    ["left", "start", 96, 200],
    ["bottom", "center", 220, 224],
    ["right", "center", 344, 160],
    ["top", "center", 220, 96],
    ["left", "center", 96, 160],
  ])("puts it on the %s, aligned to the %s", (side, align, x, y) => {
    expect(place(anchor, size, bounds, side, align, 4)).toEqual({ x, y });
  });

  it("an oversized popover anchors to the top left", () => {
    expect(
      place(
        anchor,
        { width: 2000, height: 1000 },
        bounds,
        "bottom",
        "start",
        4,
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it("moves a popover off the far edges", () => {
    const far = { left: 1430, top: 890, width: 4, height: 4 };
    expect(place(far, size, bounds, "bottom", "start", 4)).toEqual({
      x: 1240,
      y: 800,
    });
  });

  it("moves a popover off the near edges", () => {
    const near = { left: 10, top: 10, width: 4, height: 4 };
    expect(place(near, size, bounds, "left", "start", 4)).toEqual({
      x: 0,
      y: 10,
    });
    expect(place(near, size, bounds, "top", "start", 4)).toEqual({
      x: 10,
      y: 0,
    });
  });
});
