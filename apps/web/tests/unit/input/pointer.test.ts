import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { frameThrottle, isPrimaryPress } from "@/os/input/pointer";
import { stubFrames } from "../helpers/browser";

let frames: ReturnType<typeof stubFrames>;
beforeEach(() => {
  frames = stubFrames();
});
afterEach(() => vi.unstubAllGlobals());

describe("isPrimaryPress", () => {
  it.each([
    [0, true, true],
    [2, true, false],
    [0, false, false],
  ])("button %i, isPrimary %s gives %s", (button, isPrimary, expected) => {
    expect(isPrimaryPress({ button, isPrimary })).toBe(expected);
  });
});

describe("frameThrottle", () => {
  it("runs once per frame with the last value", () => {
    const run = vi.fn();
    const t = frameThrottle<number>(run);
    for (const n of [1, 2, 3, 4, 5]) t(n);
    expect(run).not.toHaveBeenCalled();
    frames.run();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(5);
  });

  it("starts a new frame after one has run", () => {
    const run = vi.fn();
    const t = frameThrottle<number>(run);
    t(1);
    frames.run();
    t(2);
    frames.run();
    expect(run.mock.calls).toEqual([[1], [2]]);
  });

  it("flush runs now and does not run again", () => {
    const run = vi.fn();
    const t = frameThrottle<number>(run);
    t(7);
    t.flush();
    expect(run).toHaveBeenCalledWith(7);
    expect(frames.pending()).toBe(0);
    frames.run();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending call", () => {
    const run = vi.fn();
    const t = frameThrottle<number>(run);
    t(7);
    t.cancel();
    frames.run();
    expect(run).not.toHaveBeenCalled();
  });

  it("flush and cancel do nothing when nothing is pending", () => {
    const run = vi.fn();
    const t = frameThrottle<number>(run);
    t.flush();
    t.cancel();
    expect(run).not.toHaveBeenCalled();
  });
});
