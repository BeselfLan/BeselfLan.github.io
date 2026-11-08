// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createBody, inverseMass, type BodyInit, type Rect } from "./body";
import { clampCenter, clampSpeed, resolvePair, resolveWalls } from "./collide";

let n = 0;
const mk = (init: Partial<BodyInit> & { grabbed?: boolean } = {}) => {
  const { grabbed, ...rest } = init;
  const b = createBody({ id: `b${n++}`, x: 0, y: 0, r: 28, ...rest });
  if (grabbed) {
    b.grabbed = true;
    b.target = { x: b.x, y: b.y };
  }
  return b;
};

describe("createBody", () => {
  it("fills the defaults and the mass", () => {
    const b = createBody({ id: "a", x: 1, y: 2, r: 5 });
    expect(b).toEqual({
      id: "a",
      x: 1,
      y: 2,
      vx: 0,
      vy: 0,
      r: 5,
      mass: 25,
      grabbed: false,
      target: null,
    });
  });

  it("throws, naming the id, on a body that is not a circle", () => {
    const bad: Partial<BodyInit>[] = [
      { r: 0 },
      { r: -3 },
      { r: NaN },
      { r: Infinity },
      { x: NaN },
      { y: Infinity },
      { vx: NaN },
      { vy: -Infinity },
    ];
    for (const over of bad) {
      expect(
        () => createBody({ id: "zed", x: 0, y: 0, r: 28, ...over }),
        JSON.stringify(over),
      ).toThrow(/"zed"/);
    }
    expect(() => createBody({ id: "", x: 0, y: 0, r: 28 })).toThrow();
  });

  it("a grabbed body has no inverse mass", () => {
    const b = mk({ r: 10 });
    expect(inverseMass(b)).toBeCloseTo(0.01, 12);
    b.grabbed = true;
    expect(inverseMass(b)).toBe(0);
  });
});

describe("resolvePair", () => {
  it("an elastic equal-mass head-on collision swaps velocities exactly", () => {
    // 1 unit of overlap: bodies that only touch (d = 56) do not collide.
    const a = mk({ x: 0, vx: 300 });
    const b = mk({ x: 55, vx: -100 });
    resolvePair(a, b, 1, 0.8);
    expect(a.vx).toBeCloseTo(-100, 9);
    expect(b.vx).toBeCloseTo(300, 9);
    expect(a.vy).toBeCloseTo(0, 9);
    expect(b.vy).toBeCloseTo(0, 9);
  });

  it("unequal masses: momentum, energy and the 1D result", () => {
    const a = mk({ x: 0, r: 28, vx: 200 }); // mass 784
    const b = mk({ x: 40, r: 14, vx: -300 }); // mass 196
    const momentum = a.mass * a.vx + b.mass * b.vx;
    const energy = 0.5 * a.mass * a.vx ** 2 + 0.5 * b.mass * b.vx ** 2;
    resolvePair(a, b, 1, 0.8);
    // Ignoring the masses would give -300 and 200.
    expect(a.vx).toBeCloseTo(0, 9);
    expect(b.vx).toBeCloseTo(500, 9);
    expect(a.mass * a.vx + b.mass * b.vx).toBeCloseTo(momentum, 6);
    expect(0.5 * a.mass * a.vx ** 2 + 0.5 * b.mass * b.vx ** 2).toBeCloseTo(
      energy,
      3,
    );
  });

  it("positional correction is mass-weighted", () => {
    const a = mk({ x: 0, r: 28 });
    const b = mk({ x: 40, r: 14 });
    resolvePair(a, b, 1, 0.8);
    // The light body moves 4 times as far. An equal split gives -0.8, and
    // weighting by mass instead of inverse mass gives -1.28.
    expect(a.x).toBeCloseTo(-0.32, 9);
    expect(b.x).toBeCloseTo(41.28, 9);
  });

  it("a grabbed partner has infinite mass", () => {
    const a = mk({ x: 0, vx: 100, grabbed: true });
    const b = mk({ x: 50 });
    resolvePair(a, b, 0.95, 0.8);
    expect(b.x).toBeCloseTo(54.8, 9);
    expect(b.vx).toBeCloseTo(195, 9);
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(a.vx).toBe(100);
  });

  it("two grabbed bodies are left alone", () => {
    const a = mk({ x: 0, grabbed: true });
    const b = mk({ x: 10, vx: -5, grabbed: true });
    resolvePair(a, b, 1, 0.8);
    expect([a.x, b.x, b.vx]).toEqual([0, 10, -5]);
  });

  it("separating bodies are pushed apart but keep their velocities", () => {
    const a = mk({ x: 0, vx: -10 });
    const b = mk({ x: 50, vx: 10 });
    resolvePair(a, b, 0.95, 0.8);
    expect(a.x).toBeCloseTo(-2.4, 9);
    expect(b.x).toBeCloseTo(52.4, 9);
    expect(a.vx).toBe(-10);
    expect(b.vx).toBe(10);
  });

  it("bodies that do not overlap are untouched", () => {
    const a = mk({ x: 0, vx: 5 });
    const b = mk({ x: 56, vx: -5 }); // exactly touching
    resolvePair(a, b, 1, 0.8);
    expect([a.x, a.vx, b.x, b.vx]).toEqual([0, 5, 56, -5]);
  });

  it("coincident centres separate along +x without NaN", () => {
    const a = mk({ x: 10, y: 10 });
    const b = mk({ x: 10, y: 10 });
    resolvePair(a, b, 0.95, 0.8);
    expect(a.x).toBeCloseTo(-12.4, 9);
    expect(b.x).toBeCloseTo(32.4, 9);
    expect(a.y).toBe(10);
    expect(b.y).toBe(10);
    for (const v of [a.vx, a.vy, b.vx, b.vy])
      expect(Number.isFinite(v)).toBe(true);
  });

  it("works along any direction", () => {
    // A 3-4-5 line of centres: the impulse is along (0.6, 0.8).
    const a = mk({ x: 0, y: 0, vx: 30, vy: 40 });
    const b = mk({ x: 30, y: 40, r: 28 });
    resolvePair(a, b, 1, 0.8);
    expect(b.vx).toBeCloseTo(30, 9);
    expect(b.vy).toBeCloseTo(40, 9);
    expect(a.vx).toBeCloseTo(0, 9);
    expect(a.vy).toBeCloseTo(0, 9);
  });
});

describe("resolveWalls", () => {
  const box: Rect = { x: 0, y: 0, width: 100, height: 100 };
  // Each wall: where the body starts, its velocity, and the result. Outward
  // motion is reflected with the restitution 0.9.
  const outward = [
    ["left", { x: 5, y: 50, vx: -50, vy: 0 }, { x: 10, vx: 45 }],
    ["right", { x: 95, y: 50, vx: 50, vy: 0 }, { x: 90, vx: -45 }],
    ["top", { x: 50, y: 5, vx: 0, vy: -50 }, { y: 10, vy: 45 }],
    ["bottom", { x: 50, y: 95, vx: 0, vy: 50 }, { y: 90, vy: -45 }],
  ] as const;

  it.each(outward)(
    "%s wall: outward motion is clamped and reflected",
    (_, from, want) => {
      const b = mk({ r: 10, ...from });
      resolveWalls(b, box, 0.9);
      for (const [key, value] of Object.entries(want)) {
        expect(b[key as "x" | "y" | "vx" | "vy"], key).toBeCloseTo(value, 9);
      }
    },
  );

  const inward = [
    ["left", { x: 5, y: 50, vx: 50, vy: 0 }, { x: 10, vx: 50 }],
    ["right", { x: 95, y: 50, vx: -50, vy: 0 }, { x: 90, vx: -50 }],
    ["top", { x: 50, y: 5, vx: 0, vy: 50 }, { y: 10, vy: 50 }],
    ["bottom", { x: 50, y: 95, vx: 0, vy: -50 }, { y: 90, vy: -50 }],
  ] as const;

  it.each(inward)(
    "%s wall: inward motion is clamped without a flip",
    (_, from, want) => {
      const b = mk({ r: 10, ...from });
      resolveWalls(b, box, 0.9);
      for (const [key, value] of Object.entries(want)) {
        expect(b[key as "x" | "y" | "vx" | "vy"], key).toBeCloseTo(value, 9);
      }
    },
  );

  it("a body inside is untouched", () => {
    const b = mk({ r: 10, x: 50, y: 40, vx: -30, vy: 20 });
    resolveWalls(b, box, 0.9);
    expect([b.x, b.y, b.vx, b.vy]).toEqual([50, 40, -30, 20]);
  });

  it("a body touching the wall exactly is untouched", () => {
    const b = mk({ r: 10, x: 10, y: 90, vx: -30, vy: 20 });
    resolveWalls(b, box, 0.9);
    expect([b.x, b.y, b.vx, b.vy]).toEqual([10, 90, -30, 20]);
  });

  it("works with bounds that do not start at the origin", () => {
    const b = mk({ r: 10, x: 105, y: 160, vx: -50 });
    resolveWalls(b, { x: 100, y: 150, width: 100, height: 100 }, 0.9);
    expect(b.x).toBeCloseTo(110, 9);
    expect(b.y).toBeCloseTo(160, 9);
    expect(b.vx).toBeCloseTo(45, 9);
  });

  it("bounds narrower than the body centre it and stop that axis", () => {
    const b = mk({ r: 10, x: 3, y: 50, vx: 40, vy: 7 });
    resolveWalls(b, { x: 0, y: 0, width: 15, height: 100 }, 0.9);
    expect(b.x).toBeCloseTo(7.5, 9);
    expect(b.vx).toBe(0);
    // The other axis is normal.
    expect(b.y).toBe(50);
    expect(b.vy).toBe(7);
  });

  it("a body far outside comes back in one call", () => {
    const b = mk({ r: 10, x: -400, y: 900, vx: -10, vy: 10 });
    resolveWalls(b, box, 0.9);
    expect([b.x, b.y]).toEqual([10, 90]);
  });
});

describe("clampCenter", () => {
  it("keeps a centre inside, and centres a span that is too narrow", () => {
    expect(clampCenter(5, 0, 100, 10)).toBe(10);
    expect(clampCenter(95, 0, 100, 10)).toBe(90);
    expect(clampCenter(50, 0, 100, 10)).toBe(50);
    expect(clampCenter(50, 100, 15, 10)).toBe(107.5);
  });
});

describe("clampSpeed", () => {
  it("scales a fast body down to the max and keeps the direction", () => {
    const b = mk({ vx: 3000, vy: 4000 });
    clampSpeed(b, 2500);
    expect(b.vx).toBeCloseTo(1500, 9);
    expect(b.vy).toBeCloseTo(2000, 9);
  });

  it("leaves a slower body unchanged", () => {
    const b = mk({ vx: 3, vy: -4 });
    clampSpeed(b, 2500);
    expect([b.vx, b.vy]).toEqual([3, -4]);
  });
});
