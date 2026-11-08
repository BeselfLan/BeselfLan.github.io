import { describe, expect, it, vi } from "vitest";
import {
  REDUCED_MOTION,
  flyTo,
  surfaceVariants,
  toScreenRect,
} from "@/os/window/windowMotion";

// A screen at scale 0.5 whose box sits at (20, 10) in the client.
const screen = {
  scale: 0.5,
  toScreenPoint: (x: number, y: number) => ({
    x: (x - 20) / 0.5,
    y: (y - 10) / 0.5,
  }),
};
const icon = { left: 100, top: 400, width: 48, height: 48 };

describe("toScreenRect", () => {
  it("minimise flies to the registered rect: client px become screen units", () => {
    expect(toScreenRect(icon, screen)).toEqual({
      x: 160,
      y: 780,
      width: 96,
      height: 96,
    });
  });
});

describe("flyTo", () => {
  it("moves centre to centre", () => {
    const box = { x: 200, y: 100, width: 400, height: 300 };
    const fly = flyTo(box, toScreenRect(icon, screen));
    expect(fly.x).toBeCloseTo(-192);
    expect(fly.y).toBeCloseTo(578);
    // The width is the tighter fit: 96 / 400.
    expect(fly.scale).toBeCloseTo(0.24);
  });

  it("scales by the tighter side", () => {
    const wide = { x: 0, y: 0, width: 100, height: 400 };
    const target = { x: 0, y: 0, width: 50, height: 50 };
    expect(flyTo(wide, target).scale).toBeCloseTo(0.125);
  });
});

describe("surfaceVariants", () => {
  const fly = vi.fn(() => ({ x: -192, y: 578, scale: 0.24 }));

  it("enter uses the 2.3 values", () => {
    expect(surfaceVariants.enter({ reduced: false, fly })).toEqual({
      opacity: 0,
      scale: 0.96,
    });
    expect(surfaceVariants.shown).toMatchObject({ opacity: 1, scale: 1 });
    expect(surfaceVariants.shown.transition.duration).toBe(0.12);
    expect(surfaceVariants.exit).toMatchObject({ opacity: 0 });
    expect(surfaceVariants.exit.transition.duration).toBe(0.1);
  });

  it("minimise flies with the fly it is given", () => {
    expect(surfaceVariants.minimized({ reduced: false, fly })).toMatchObject({
      opacity: 0,
      x: -192,
      y: 578,
      scale: 0.24,
    });
  });

  it("minimise fades when there is no fly", () => {
    const out = surfaceVariants.minimized({ reduced: false, fly: () => null });
    expect(out).toEqual({ opacity: 0, transition: { duration: 0.15 } });
  });

  it("reduced means fade only", () => {
    fly.mockClear();
    expect(surfaceVariants.enter({ reduced: true, fly })).toEqual({
      opacity: 0,
    });
    const out = surfaceVariants.minimized({ reduced: true, fly });
    expect(fly).not.toHaveBeenCalled();
    expect(out).not.toHaveProperty("x");
    expect(out).not.toHaveProperty("y");
    expect(out).not.toHaveProperty("scale");
    expect(out).toMatchObject({ opacity: 0 });
  });
});

describe("REDUCED_MOTION", () => {
  it("the setting maps onto MotionConfig", () => {
    expect(REDUCED_MOTION).toEqual({
      system: "user",
      on: "always",
      off: "never",
    });
  });
});
