// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

const draw = (seed: number, n: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe("createRng", () => {
  it("gives the same 100 values for the same seed", () => {
    expect(draw(1234, 100)).toEqual(draw(1234, 100));
  });

  it("gives different values for a nearby seed", () => {
    const a = draw(1234, 100);
    const b = draw(1235, 100);
    const differing = a.filter((v, i) => v !== b[i]).length;
    expect(differing).toBeGreaterThanOrEqual(95);
  });

  it("stays in [0, 1) with a mean near one half", () => {
    const values = draw(99, 10_000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThanOrEqual(0.48);
    expect(mean).toBeLessThanOrEqual(0.52);
    // A constant generator has one distinct value.
    expect(new Set(values).size).toBeGreaterThan(9_000);
  });

  it("range stays in [min, max) and reaches both signs", () => {
    const rng = createRng(7);
    const values = Array.from({ length: 1000 }, () => rng.range(-15, 15));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-15);
    expect(Math.max(...values)).toBeLessThan(15);
    expect(values.some((v) => v < 0)).toBe(true);
    expect(values.some((v) => v > 0)).toBe(true);
  });

  it("range and next share one stream", () => {
    const a = createRng(5);
    const b = createRng(5);
    expect(a.range(10, 20)).toBeCloseTo(10 + 10 * b.next(), 12);
  });

  it("throws on a seed that is not finite", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => createRng(bad)).toThrow();
    }
  });
});
