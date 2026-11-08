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
