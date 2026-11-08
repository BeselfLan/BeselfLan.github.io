// The pointer maths of the Skills app (plan 6.4, Appendix C.2): what a press
// was (a click or a drag), where the pointer is in stage units, how big the
// screen's scale is, and how fast the pointer was going when it was released.
// No React and no DOM: a handler passes in numbers, so a test can pass any.
// Times are in milliseconds, from `performance.now()` in the caller's handler.
//
// This file is not imported by `index.ts`, so it stays out of the page's first
// chunk. The constants come from physics/constants.ts, which is #19's.

import type { Vec } from "./physics/body";
import { INTERACTION } from "./physics/constants";

export interface VelocityTracker {
  /** Records the pointer at time `t` (ms). Allocates nothing. */
  push(t: number, x: number, y: number): void;
  /** The release velocity at time `now`, in units per second. */
  velocity(now: number): Vec;
  /** Forgets every sample, for the next press. */
  reset(): void;
}

/**
 * A ring of the last `capacity` pointer samples in preallocated arrays, so a
 * drag allocates nothing per event. C.2 says the release velocity is "the mean
 * of samples in the last 80 ms (ring buffer of 8)". This reads it as the mean
 * velocity over that window: the newest sample minus the oldest one that is at
 * most `windowMs` old, divided by the time between them. A sample exactly
 * `windowMs` old counts. With fewer than two such samples, or less than 1 ms
 * between them, the result is 0, so a press that is held still and then let go
 * does not flick. The world clamps the result to 2500 (#19). Override: the
 * mean of the velocities of consecutive pairs. `capacity` is at least 2.
 */
export function createVelocityTracker(
  capacity: number = INTERACTION.releaseSamples,
  windowMs: number = INTERACTION.releaseWindowMs,
): VelocityTracker {
  const size = Math.max(2, Math.floor(capacity));
  const times = new Float64Array(size);
  const xs = new Float64Array(size);
  const ys = new Float64Array(size);
  let head = 0; // where the next sample goes
  let held = 0; // samples in the ring, at most `size`

  return {
    push(t, x, y) {
      times[head] = t;
      xs[head] = x;
      ys[head] = y;
      head = (head + 1) % size;
      if (held < size) held++;
    },
    velocity(now) {
      const newest = (head + size - 1) % size;
      const limit = now - windowMs;
      let oldest = newest;
      let n = 0;
      // Walk back from the newest sample while it is still in the window.
      for (let k = 0; k < held; k++) {
        const i = (newest + size - k) % size;
        if (!(times[i] >= limit)) break;
        oldest = i;
        n++;
      }
      if (n < 2) return { x: 0, y: 0 };
      const gap = times[newest] - times[oldest];
      if (!(gap >= 1)) return { x: 0, y: 0 };
      // Multiplied before dividing, so 35 units in 35 ms is exactly 1000.
      return {
        x: ((xs[newest] - xs[oldest]) * 1000) / gap,
        y: ((ys[newest] - ys[oldest]) * 1000) / gap,
      };
    },
    reset() {
      head = 0;
      held = 0;
    },
  };
}

/**
 * A click is a press that moved less than 4 units and lasted less than 250 ms
 * (C.2). `travel` is the largest distance from the press point during the
 * press, not the final distance, so a drag that comes back to its start is
 * still a drag; the caller measures it. `NaN` is not a click.
 */
export function isClick(travel: number, elapsedMs: number): boolean {
  return (
    travel < INTERACTION.clickMaxTravel && elapsedMs < INTERACTION.clickMaxMs
  );
}

/**
 * Client pixels to stage units: the offset from the stage's top-left corner,
 * divided by the screen's scale. A scale that is not a finite number above 0
 * counts as 1, because this runs in a pointer handler and must not throw.
 */
export function stagePoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  scale: number,
): Vec {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return { x: (clientX - rect.left) / s, y: (clientY - rect.top) / s };
}

/**
 * The screen's scale, measured from an element: `getBoundingClientRect()`
 * includes the screen's CSS scale and `offsetWidth` does not. #89 measures the
 * stage this way because the lead's registry.test.ts renders every app outside
 * a Screen, where `useScreen()` throws (the same call as #17's split for #83).
 * It gives 1 unless both widths are finite and above 0.
 */
export function measureScale(rectWidth: number, offsetWidth: number): number {
  return Number.isFinite(rectWidth) &&
    Number.isFinite(offsetWidth) &&
    rectWidth > 0 &&
    offsetWidth > 0
    ? rectWidth / offsetWidth
    : 1;
}
