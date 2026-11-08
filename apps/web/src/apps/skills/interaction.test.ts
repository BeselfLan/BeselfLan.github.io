// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createVelocityTracker,
  isClick,
  measureScale,
  stagePoint,
  type VelocityTracker,
} from "./interaction";

/** Pushes one sample per entry: [t, x, y]. */
function fed(samples: [t: number, x: number, y?: number][]): VelocityTracker {
  const tracker = createVelocityTracker();
  for (const [t, x, y = 0] of samples) tracker.push(t, x, y);
  return tracker;
}

describe("isClick", () => {
  it("is a press under 4 units and under 250 ms", () => {
    expect(isClick(3.9, 249)).toBe(true);
    expect(isClick(0, 0)).toBe(true);
  });

  it("is a drag at 4 units, and a hold at 250 ms", () => {
    expect(isClick(4, 100)).toBe(false);
    expect(isClick(0, 250)).toBe(false);
    expect(isClick(100, 1000)).toBe(false);
  });

  it("is not a click when a number is not a number", () => {
    expect(isClick(NaN, 10)).toBe(false);
    expect(isClick(1, NaN)).toBe(false);
  });
});

describe("the release velocity", () => {
  it("is the mean velocity in units per second", () => {
    const x = fed([
      [0, 0],
      [10, 10],
      [20, 20],
      [30, 30],
    ]);
    expect(x.velocity(30)).toEqual({ x: 1000, y: 0 });

    const y = fed([
      [0, 0, 0],
      [10, 0, 10],
      [20, 0, 20],
    ]);
    expect(y.velocity(20)).toEqual({ x: 0, y: 1000 });
  });

  it("follows the direction of the move", () => {
    const left = fed([
      [0, 100],
      [10, 90],
      [20, 80],
    ]);
    expect(left.velocity(20)).toEqual({ x: -1000, y: 0 });
  });

  it("is 0 with fewer than 2 samples", () => {
    const tracker = createVelocityTracker();
    expect(tracker.velocity(0)).toEqual({ x: 0, y: 0 });
    tracker.push(0, 50, 50);
    expect(tracker.velocity(0)).toEqual({ x: 0, y: 0 });
    tracker.push(10, 60, 50);
    expect(tracker.velocity(10)).toEqual({ x: 1000, y: 0 });
  });

  it("reads only the last 80 ms", () => {
    // The pointer moved, then nothing came in for 130 ms: a press held still
    // and then let go does not flick.
    const tracker = fed(
      [0, 10, 20, 30, 40, 50, 60, 70].map((t) => [t, t] as [number, number]),
    );
    expect(tracker.velocity(70)).toEqual({ x: 1000, y: 0 });
    expect(tracker.velocity(200)).toEqual({ x: 0, y: 0 });
  });

  it("drops the samples that are older than the window", () => {
    // A fast start, then a slow stretch: only the slow part is in the window.
    const tracker = fed([
      [0, 0],
      [10, 100],
      [100, 100],
      [140, 104],
      [180, 108],
    ]);
    // At 180 the window opens at 100: 108 - 100 over 80 ms is 100 per second.
    expect(tracker.velocity(180).x).toBeCloseTo(100, 10);
  });

  it("counts a sample that is exactly 80 ms old", () => {
    const tracker = fed([
      [0, 0],
      [80, 80],
    ]);
    expect(tracker.velocity(80)).toEqual({ x: 1000, y: 0 });
    expect(tracker.velocity(81)).toEqual({ x: 0, y: 0 });
  });

  it("keeps only the last 8 samples", () => {
    // Ten samples: two at x 100, then eight on the line x = t.
    const tracker = fed([
      [0, 100],
      [5, 100],
      ...[10, 15, 20, 25, 30, 35, 40, 45].map(
        (t) => [t, t] as [number, number],
      ),
    ]);
    expect(tracker.velocity(45)).toEqual({ x: 1000, y: 0 });
  });

  it("is 0 when the samples are less than 1 ms apart", () => {
    const tracker = fed([
      [10, 0],
      [10.5, 1000],
    ]);
    expect(tracker.velocity(10.5)).toEqual({ x: 0, y: 0 });
    // The same two samples a millisecond apart give a real speed.
    const slower = fed([
      [10, 0],
      [11, 1],
    ]);
    expect(slower.velocity(11)).toEqual({ x: 1000, y: 0 });
  });

  it("forgets everything on reset", () => {
    const tracker = fed([
      [0, 0],
      [10, 10],
      [20, 20],
    ]);
    expect(tracker.velocity(20).x).toBe(1000);
    tracker.reset();
    expect(tracker.velocity(20)).toEqual({ x: 0, y: 0 });
    // One new sample is still not enough, and the old ones do not come back.
    tracker.push(25, 500, 500);
    expect(tracker.velocity(25)).toEqual({ x: 0, y: 0 });
    tracker.push(35, 510, 500);
    expect(tracker.velocity(35)).toEqual({ x: 1000, y: 0 });
  });

  it("takes its capacity and window as arguments", () => {
    const tracker = createVelocityTracker(3, 1000);
    for (const t of [0, 10, 20, 30]) tracker.push(t, t, 0);
    // Three samples (10, 20, 30) in a long window.
    expect(tracker.velocity(30)).toEqual({ x: 1000, y: 0 });
    const tiny = createVelocityTracker(0, 1000);
    tiny.push(0, 0, 0);
    tiny.push(10, 10, 0);
    expect(tiny.velocity(10)).toEqual({ x: 1000, y: 0 });
  });
});

describe("stagePoint", () => {
  it("is the offset from the stage corner divided by the scale", () => {
    expect(stagePoint(150, 70, { left: 100, top: 50 }, 0.5)).toEqual({
      x: 100,
      y: 40,
    });
    expect(stagePoint(150, 70, { left: 100, top: 50 }, 1)).toEqual({
      x: 50,
      y: 20,
    });
    expect(stagePoint(100, 50, { left: 100, top: 50 }, 0.5)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("goes negative above and left of the stage", () => {
    expect(stagePoint(90, 40, { left: 100, top: 50 }, 2)).toEqual({
      x: -5,
      y: -5,
    });
  });

  it("counts a scale that is not above 0 as 1", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(
        stagePoint(150, 70, { left: 100, top: 50 }, bad),
        String(bad),
      ).toEqual({
        x: 50,
        y: 20,
      });
    }
  });
});

describe("measureScale", () => {
  it("is the rendered width over the layout width", () => {
    expect(measureScale(500, 1000)).toBe(0.5);
    expect(measureScale(1000, 1000)).toBe(1);
    expect(measureScale(1500, 1000)).toBe(1.5);
  });

  it("is 1 when either width is unusable", () => {
    expect(measureScale(0, 0)).toBe(1);
    expect(measureScale(300, 0)).toBe(1);
    expect(measureScale(0, 1000)).toBe(1);
    expect(measureScale(NaN, 1000)).toBe(1);
    expect(measureScale(500, NaN)).toBe(1);
    expect(measureScale(Infinity, 1000)).toBe(1);
    expect(measureScale(-5, 1000)).toBe(1);
  });
});
