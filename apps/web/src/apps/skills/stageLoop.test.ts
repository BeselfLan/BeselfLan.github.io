// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createStageLoop, transformFor, type StageLoop } from "./stageLoop";

// The loop with a clock that the test turns by hand: `request` keeps the
// callback and gives a rising handle, `cancel` records the handle (and keeps
// the callback, so a test can run a stale one), and `frame(t)` runs it as a
// browser would, once.

const BOUNDS = { x: 0, y: 0, width: 1000, height: 492 };

function setup({ visible = true }: { visible?: boolean } = {}) {
  let handle = 0;
  let stored: ((t: number) => void) | null = null;
  const cancelled: number[] = [];
  const request = vi.fn((cb: (t: number) => void) => {
    stored = cb;
    return ++handle;
  });
  const cancel = vi.fn((h: number) => {
    cancelled.push(h);
  });
  let onVisible: (v: boolean) => void = () => {};
  const unsubscribe = vi.fn();
  const write = vi.fn<(id: string, transform: string) => void>();

  const loop: StageLoop = createStageLoop({
    bounds: BOUNDS,
    seed: 1,
    clock: { now: () => 0, request, cancel },
    visibility: {
      isVisible: () => visible,
      subscribe: (cb) => {
        onVisible = cb;
        return unsubscribe;
      },
    },
    write,
  });

  return {
    loop,
    request,
    cancel,
    cancelled,
    write,
    unsubscribe,
    /** The handle of the newest request. */
    handle: () => handle,
    /** Runs the stored callback, once, as the browser would at time `t`. */
    frame: (t: number) => {
      const cb = stored;
      stored = null;
      cb?.(t);
    },
    setVisible: (v: boolean) => onVisible(v),
  };
}

const body = (loop: StageLoop, id: string) =>
  loop.bodies().find((b) => b.id === id)!;

/** One body that is moving right at 1000 units/s. */
function launched() {
  const s = setup();
  s.loop.setBodies(["a"]);
  const a = body(s.loop, "a");
  s.loop.grab("a", { x: a.x, y: a.y });
  s.loop.release("a", { x: 1000, y: 0 });
  return s;
}

describe("transformFor", () => {
  it("puts the box's corner at the centre less the radius", () => {
    expect(transformFor({ x: 100, y: 50, r: 28 })).toBe(
      "translate3d(72.00px, 22.00px, 0)",
    );
  });
});

describe("createStageLoop", () => {
  it("writes every body at once, before any frame", () => {
    const { loop, write, request } = setup();
    loop.setBodies(["a", "b", "c"], 28);
    expect(write).toHaveBeenCalledTimes(3);
    expect(write.mock.calls.map(([id]) => id)).toEqual(["a", "b", "c"]);
    for (const [, transform] of write.mock.calls) {
      expect(transform.startsWith("translate3d(")).toBe(true);
    }
    for (const b of loop.bodies()) {
      expect(b.r).toBe(28);
      expect(b.x - b.r).toBeGreaterThanOrEqual(0);
      expect(b.x + b.r).toBeLessThanOrEqual(1000);
      expect(b.y - b.r).toBeGreaterThanOrEqual(0);
      expect(b.y + b.r).toBeLessThanOrEqual(492);
    }
    // Nothing has run, only been asked for.
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("writes the transform of the body it names", () => {
    const { loop, write } = setup();
    loop.setBodies(["a", "b"]);
    for (const [id, transform] of write.mock.calls) {
      expect(transform).toBe(transformFor(body(loop, id)));
    }
  });

  it("does not step on its first frame", () => {
    const { loop, frame } = launched();
    const x0 = body(loop, "a").x;
    frame(1000);
    expect(body(loop, "a").x).toBe(x0);
    frame(1016);
    // 16 ms at 1000 units/s. A first frame that stepped would add about 33
    // more at once (the 1/30 s cap).
    const moved = body(loop, "a").x - x0;
    expect(moved).toBeGreaterThan(10);
    expect(moved).toBeLessThan(20);
  });

  it("steps by the time between frames, and asks for the next one", () => {
    const { loop, frame, request } = launched();
    const x0 = body(loop, "a").x;
    frame(0);
    expect(request).toHaveBeenCalledTimes(2);
    frame(8);
    frame(16);
    expect(request).toHaveBeenCalledTimes(4);
    const moved = body(loop, "a").x - x0;
    expect(moved).toBeGreaterThan(10);
    expect(moved).toBeLessThan(20);
  });

  it("writes every body on every frame", () => {
    const { loop, frame, write } = setup();
    loop.setBodies(["a", "b", "c"]);
    write.mockClear();
    frame(0);
    frame(16);
    expect(write).toHaveBeenCalledTimes(6);
  });

  describe("while the window is hidden", () => {
    it("cancels the frame and asks for none", () => {
      const { frame, request, cancelled, handle, write, setVisible, loop } =
        launched();
      frame(1000);
      const pending = handle();
      const asked = request.mock.calls.length;
      setVisible(false);
      expect(cancelled).toEqual([pending]);
      expect(request).toHaveBeenCalledTimes(asked);
      // Even a stale callback that still runs writes and asks for nothing.
      write.mockClear();
      const x = body(loop, "a").x;
      frame(1016);
      expect(write).not.toHaveBeenCalled();
      expect(request).toHaveBeenCalledTimes(asked);
      expect(body(loop, "a").x).toBe(x);
    });

    it("steps 0 on the first frame after it is back", () => {
      const { loop, frame, request, setVisible } = launched();
      frame(1000);
      frame(1016);
      setVisible(false);
      const asked = request.mock.calls.length;
      const x = body(loop, "a").x;

      setVisible(true);
      expect(request).toHaveBeenCalledTimes(asked + 1);
      // Five seconds passed. A loop that kept its last time would step the
      // cap (about 33 units) here.
      frame(1016 + 5000);
      expect(body(loop, "a").x).toBe(x);
      frame(1016 + 5016);
      const moved = body(loop, "a").x - x;
      expect(moved).toBeGreaterThan(10);
      expect(moved).toBeLessThan(20);
    });

    it("asks for one frame however often it is shown", () => {
      const { request, setVisible } = setup();
      setVisible(true);
      setVisible(true);
      expect(request).toHaveBeenCalledTimes(1);
    });

    it("starts paused when the window starts hidden", () => {
      const { loop, request, frame, setVisible, write } = setup({
        visible: false,
      });
      expect(request).not.toHaveBeenCalled();
      // A body set while hidden is still written once, so it has a place.
      loop.setBodies(["a"]);
      expect(write).toHaveBeenCalledTimes(1);
      expect(request).not.toHaveBeenCalled();
      frame(0);
      expect(write).toHaveBeenCalledTimes(1);
      setVisible(true);
      expect(request).toHaveBeenCalledTimes(1);
    });
  });

  it("swaps the set, keeping the same array", () => {
    const { loop, write } = setup();
    loop.setBodies(["a", "b", "c"]);
    const list = loop.bodies();
    loop.setBodies(["c", "d"]);
    expect(loop.bodies()).toBe(list);
    expect(list.map((b) => b.id)).toEqual(["c", "d"]);
    for (const b of list) {
      expect(b.x - b.r).toBeGreaterThanOrEqual(0);
      expect(b.x + b.r).toBeLessThanOrEqual(1000);
      expect(b.y - b.r).toBeGreaterThanOrEqual(0);
      expect(b.y + b.r).toBeLessThanOrEqual(492);
    }
    write.mockClear();
    loop.setBodies(["c", "d"]);
    expect(write.mock.calls.map(([id]) => id)).toEqual(["c", "d"]);
  });

  it("empties on no ids", () => {
    const { loop } = setup();
    loop.setBodies(["a", "b"]);
    loop.setBodies([]);
    expect(loop.bodies()).toHaveLength(0);
  });

  it("lays out a new set with the radius it is given", () => {
    const { loop } = setup();
    loop.setBodies(["a", "b"], 24);
    expect(loop.bodies().map((b) => b.r)).toEqual([24, 24]);
    loop.setBodies(["a"]);
    expect(body(loop, "a").r).toBe(28);
  });

  it("follows the bounds", () => {
    const { loop, frame } = setup();
    loop.setBodies(["a", "b", "c"]);
    loop.setBounds({ x: 0, y: 0, width: 600, height: 492 });
    for (let i = 0; i < 60; i++) frame(i * 16);
    for (const b of loop.bodies()) {
      expect(b.x + b.r).toBeLessThanOrEqual(600.5);
    }
  });

  it("spawns a new set in the bounds it was last given", () => {
    const { loop } = setup();
    loop.setBounds({ x: 0, y: 0, width: 300, height: 200 });
    loop.setBodies(["a", "b"]);
    for (const b of loop.bodies()) {
      expect(b.x + b.r).toBeLessThanOrEqual(300);
      expect(b.y + b.r).toBeLessThanOrEqual(200);
    }
  });

  it("refuses bounds that are not finite, and keeps the old ones", () => {
    const { loop } = setup();
    expect(() =>
      loop.setBounds({ x: 0, y: 0, width: Number.NaN, height: 100 }),
    ).toThrow();
    loop.setBodies(["a"]);
    expect(body(loop, "a").x + 28).toBeLessThanOrEqual(1000);
    expect(body(loop, "a").y + 28).toBeLessThanOrEqual(492);
  });

  it("passes the pointer through to the world", () => {
    const { loop, frame } = setup();
    loop.setBodies(["a"]);
    // `bodies()` holds live objects, so take the numbers first.
    const { x, y } = body(loop, "a");
    loop.grab("a", { x, y });
    loop.moveGrab("a", { x: x + 100, y });
    for (let i = 0; i < 30; i++) frame(i * 16);
    expect(body(loop, "a").grabbed).toBe(true);
    expect(body(loop, "a").x).toBeCloseTo(x + 100, 5);
    expect(body(loop, "a").y).toBeCloseTo(y, 5);
  });

  it("disposes: cancels the frame, unsubscribes, and ignores later frames", () => {
    const { loop, frame, cancelled, handle, write, unsubscribe, request } =
      setup();
    loop.setBodies(["a"]);
    frame(0);
    const pending = handle();
    const asked = request.mock.calls.length;
    loop.dispose();
    expect(cancelled).toEqual([pending]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    write.mockClear();
    frame(16);
    expect(write).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(asked);
    expect(() => loop.dispose()).not.toThrow();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(cancelled).toEqual([pending]);
  });

  it("does not start again when shown after it is disposed", () => {
    const { loop, request, setVisible } = setup();
    loop.dispose();
    const asked = request.mock.calls.length;
    setVisible(true);
    expect(request).toHaveBeenCalledTimes(asked);
  });
});

describe("the wall (#90)", () => {
  it("slides in", () => {
    const { loop, frame } = setup();
    loop.setBodies(["a"]);
    loop.setWall(true, 1000);
    // The wall waits for its first frame.
    expect(loop.bounds().width).toBe(1000);
    frame(1000);
    expect(loop.bounds().width).toBe(1000);
    // PANEL_MS is 250 and the ease is out-cubic: 87.5 percent of 340 by half.
    frame(1125);
    expect(loop.bounds().width).toBe(702.5);
    frame(1250);
    expect(loop.bounds().width).toBe(660);
    frame(1400);
    expect(loop.bounds().width).toBe(660);
    expect(loop.bounds()).toEqual({ x: 0, y: 0, width: 660, height: 492 });
  });

  it("slides back", () => {
    const { loop, frame } = setup();
    loop.setBodies(["a"]);
    loop.setWall(true, 0, { instant: true });
    // No frame has run.
    expect(loop.bounds().width).toBe(660);
    loop.setWall(false, 2000);
    frame(2000);
    expect(loop.bounds().width).toBe(660);
    frame(2125);
    // Closing is 1 - p: 12.5 percent of the panel is still in at half time.
    expect(loop.bounds().width).toBe(957.5);
    frame(2250);
    expect(loop.bounds().width).toBe(1000);
  });

  it("starts the slide at the time it is given, or at the clock's", () => {
    const { loop, frame } = setup();
    loop.setBodies(["a"]);
    // clock.now() is 0 here.
    loop.setWall(true);
    frame(125);
    expect(loop.bounds().width).toBe(702.5);
  });

  it("a reversal starts where the wall is", () => {
    const { loop, frame } = setup();
    loop.setBodies(["a"]);
    loop.setWall(true, 1000);
    frame(1000);
    frame(1125);
    expect(loop.bounds().width).toBe(702.5);
    loop.setWall(false, 1125);
    frame(1250);
    // 0.875 of the panel was in; the ease takes 87.5 percent of it back.
    expect(loop.bounds().width).toBeCloseTo(962.8125, 6);
    expect(loop.bounds().width).not.toBe(660);
    expect(loop.bounds().width).not.toBe(1000);
  });

  it("asking again does not restart", () => {
    const { loop, frame } = setup();
    loop.setBodies(["a"]);
    loop.setWall(true, 1000);
    frame(1000);
    frame(1125);
    loop.setWall(true, 1125);
    frame(1250);
    expect(loop.bounds().width).toBe(660);
    // And once it is in, asking again does nothing.
    loop.setWall(true, 2000);
    frame(2100);
    expect(loop.bounds().width).toBe(660);
  });

  it("a resize keeps the wall", () => {
    const { loop } = setup();
    loop.setBodies(["a"]);
    loop.setWall(true, 0, { instant: true });
    loop.setBounds({ ...BOUNDS, width: 1200 });
    expect(loop.bounds().width).toBe(860);
    loop.setWall(false, 0, { instant: true });
    expect(loop.bounds().width).toBe(1200);
  });

  it("a resize during the slide keeps its progress", () => {
    const { loop, frame } = setup();
    loop.setBodies(["a"]);
    loop.setWall(true, 1000);
    frame(1000);
    frame(1125);
    loop.setBounds({ ...BOUNDS, width: 1200 });
    expect(loop.bounds().width).toBe(1200 - 340 * 0.875);
    frame(1250);
    expect(loop.bounds().width).toBe(860);
  });

  it("a set spawned with the wall in stays left of it", () => {
    const { loop } = setup();
    loop.setWall(true, 0, { instant: true });
    loop.setBodies(
      Array.from({ length: 45 }, (_, i) => `s${i}`),
      28,
    );
    for (const b of loop.bodies()) expect(b.x + b.r).toBeLessThanOrEqual(660);
  });

  it("nobody is stuck behind it", () => {
    const { loop, frame } = setup();
    loop.setBodies(
      Array.from({ length: 45 }, (_, i) => `s${i}`),
      28,
    );
    loop.setWall(true);
    for (let t = 0; t <= 2000; t += 16) frame(t);
    expect(loop.bounds().width).toBe(660);
    expect(loop.bodies()).toHaveLength(45);
    for (const b of loop.bodies()) {
      expect(b.x + b.r).toBeLessThanOrEqual(660.5);
    }
  });

  it("setBounds still refuses NaN with the wall in", () => {
    const { loop } = setup();
    loop.setWall(true, 0, { instant: true });
    expect(() => loop.setBounds({ ...BOUNDS, width: NaN })).toThrow();
    expect(loop.bounds().width).toBe(660);
    // The stage is the old one, not the refused one.
    loop.setWall(false, 0, { instant: true });
    expect(loop.bounds().width).toBe(1000);
  });

  it("hands out a copy of the bounds", () => {
    const { loop } = setup();
    loop.bounds().width = 5;
    expect(loop.bounds().width).toBe(1000);
  });

  it("lands a wall set while hidden on the first frame after it shows", () => {
    const { loop, frame, setVisible } = setup({ visible: false });
    loop.setBodies(["a"]);
    loop.setWall(true, 0);
    expect(loop.bounds().width).toBe(1000);
    setVisible(true);
    frame(5000);
    expect(loop.bounds().width).toBe(660);
  });
});
