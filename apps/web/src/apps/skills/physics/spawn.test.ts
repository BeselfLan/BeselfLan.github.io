// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Rect, Vec } from "./body";
import { createRng } from "./rng";
import { spawnPositions } from "./spawn";

const B: Rect = { x: 0, y: 0, width: 1000, height: 580 };

function expectInside(points: Vec[], bounds: Rect, r: number) {
  for (const p of points) {
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(bounds.x + r - 1e-9);
    expect(p.x).toBeLessThanOrEqual(bounds.x + bounds.width - r + 1e-9);
    expect(p.y).toBeGreaterThanOrEqual(bounds.y + r - 1e-9);
    expect(p.y).toBeLessThanOrEqual(bounds.y + bounds.height - r + 1e-9);
  }
}

function closest(points: Vec[]): number {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      min = Math.min(
        min,
        Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y),
      );
    }
  }
  return min;
}

describe("spawnPositions", () => {
  it.each([
    ["45 in the main bounds", 45, B, 28],
    ["45 beside the panel", 45, { x: 0, y: 0, width: 660, height: 580 }, 28],
    [
      "45 in the fullscreen mode",
      45,
      { x: 0, y: 0, width: 1440, height: 900 },
      24,
    ],
    ["1 in the main bounds", 1, B, 28],
  ])("never overlaps and stays inside: %s", (_, count, bounds, r) => {
    const points = spawnPositions(count, bounds, r, createRng(77));
    expect(points).toHaveLength(count);
    expectInside(points, bounds, r);
    if (count > 1) expect(closest(points)).toBeGreaterThanOrEqual(2 * r - 1e-9);
  });

  it("never overlaps for any seed that fits", () => {
    for (let seed = 0; seed < 50; seed++) {
      const points = spawnPositions(45, B, 28, createRng(seed));
      expect(closest(points), `seed ${seed}`).toBeGreaterThanOrEqual(56 - 1e-9);
      expectInside(points, B, 28);
    }
  });

  it("spreads over the area", () => {
    const points = spawnPositions(9, B, 28, createRng(77));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    // Packed row by row from the top left, the height would be 0.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(500);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(145);
  });

  it("is deterministic, and the jitter follows the rng", () => {
    const a = spawnPositions(20, B, 28, createRng(77));
    expect(spawnPositions(20, B, 28, createRng(77))).toEqual(a);
    expect(spawnPositions(20, B, 28, createRng(78))).not.toEqual(a);
  });

  it("respects bounds that do not start at the origin", () => {
    const bounds: Rect = { x: 100, y: 50, width: 600, height: 400 };
    const points = spawnPositions(10, bounds, 28, createRng(3));
    expect(points).toHaveLength(10);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(128);
      expect(p.y).toBeGreaterThanOrEqual(78);
    }
    expectInside(points, bounds, 28);
  });

  it("gives finite points inside when there are too many to fit", () => {
    const bounds: Rect = { x: 0, y: 0, width: 300, height: 300 };
    const points = spawnPositions(200, bounds, 28, createRng(3));
    expect(points).toHaveLength(200);
    expectInside(points, bounds, 28);
  });

  it("copes with bounds as small as, or smaller than, an icon", () => {
    for (const bounds of [
      { x: 0, y: 0, width: 56, height: 56 },
      { x: 0, y: 0, width: 20, height: 580 },
      { x: 0, y: 0, width: 1000, height: 10 },
      { x: 0, y: 0, width: 0, height: 0 },
    ]) {
      const points = spawnPositions(5, bounds, 28, createRng(3));
      expect(points).toHaveLength(5);
      for (const p of points) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
    }
  });

  it("gives an empty list for none", () => {
    expect(spawnPositions(0, B, 28, createRng(77))).toEqual([]);
    expect(spawnPositions(-3, B, 28, createRng(77))).toEqual([]);
  });

  it("centres a partial last row", () => {
    // 7 in a tall box: 2 columns, 4 rows, and one point in the last row. The
    // cells are 172 wide with up to 29 of jitter, and the lone point is
    // centred and shifted a quarter cell: x = 28 + 1.25 * 172 = 243. Left
    // aligned, it would sit near 157.
    const bounds: Rect = { x: 0, y: 0, width: 400, height: 1000 };
    const points = spawnPositions(7, bounds, 28, createRng(1));
    expect(points).toHaveLength(7);
    expectInside(points, bounds, 28);
    expect(closest(points)).toBeGreaterThanOrEqual(56 - 1e-9);
    expect(points[6].x).toBeGreaterThanOrEqual(243 - 29 - 1e-9);
    expect(points[6].x).toBeLessThanOrEqual(243 + 29 + 1e-9);
  });
});
