import type { Body, BodyId, Rect, Vec } from "./physics/body";
import { ICON_RADIUS } from "./physics/constants";
import { createRng } from "./physics/rng";
import { spawnPositions } from "./physics/spawn";
import { createPhysicsWorld } from "./physics/world";

// The animation loop around the Skills physics world (plan 6.3, D7, D13). No
// React and no DOM: the clock, the visibility and the sink for the transforms
// are injected, so a node test drives the frames by hand (node has no
// `requestAnimationFrame`) and `useSkillsWorld.ts` supplies the real ones.
//
// Each frame measures the time since the last one, steps the world, and writes
// a `translate3d` per body. While the window is hidden the loop asks for no
// frame, and the first frame after it comes back steps 0: the gap is not time
// the icons lived through (6.3). The world's own dt cap (1/30 s) is only the
// fallback. A tab switch swaps the whole set of bodies and re-seeds it, so no
// icon spends a frame at 0,0.
//
// This file sits beside `physics/`, not in it: `physics/purity.test.ts` keeps
// the engine free of the clock, and the engine stays #19's. Nothing here sets
// React state per frame, and a frame allocates nothing but the transform
// strings.

/**
 * The frame clock. `now` is on the same clock as the timestamps that `request`
 * hands its callback; the loop itself reads only those timestamps. `now` is
 * for the panel's wall (#90).
 */
export interface FrameClock {
  now(): number;
  request(cb: (t: number) => void): number;
  cancel(handle: number): void;
}

export interface LoopVisibility {
  isVisible(): boolean;
  /** Calls back only when visibility changes. Returns the unsubscribe. */
  subscribe(cb: (visible: boolean) => void): () => void;
}

export interface StageLoopOptions {
  bounds: Rect;
  /** An integer. It seeds the world and the spawn layout. */
  seed: number;
  clock: FrameClock;
  visibility: LoopVisibility;
  /** Called with each body's transform, once per frame and on every re-seed. */
  write(id: string, transform: string): void;
}

export interface StageLoop {
  /**
   * Replaces every body with one per id, at fresh spawn positions with radius
   * `r`, and writes them at once. An id that repeats throws.
   */
  setBodies(ids: readonly string[], r?: number): void;
  /** Throws on a field that is not finite, before anything changes. */
  setBounds(rect: Rect): void;
  grab(id: BodyId, point: Vec): void;
  moveGrab(id: BodyId, point: Vec): void;
  release(id: BodyId, velocity: Vec): void;
  /** The world's own array, in insertion order. Read it after each step. */
  bodies(): ReadonlyArray<Body>;
  /** Stops the loop for good. Safe to call twice. */
  dispose(): void;
}

/**
 * The CSS transform of a body: the icon's box is placed with its top-left
 * corner at the centre minus the radius, in screen units.
 */
export function transformFor(b: Pick<Body, "x" | "y" | "r">): string {
  return `translate3d(${(b.x - b.r).toFixed(2)}px, ${(b.y - b.r).toFixed(2)}px, 0)`;
}

export function createStageLoop(o: StageLoopOptions): StageLoop {
  const world = createPhysicsWorld({ bounds: o.bounds, seed: o.seed });
  // For the spawn layout only: the world has its own, from the same seed.
  const rng = createRng(o.seed);
  let bounds = o.bounds;
  let frame: number | null = null;
  let last: number | null = null;
  let visible = o.visibility.isVisible();
  let disposed = false;

  function writeAll() {
    const list = world.bodies();
    for (let i = 0; i < list.length; i++) {
      o.write(list[i].id, transformFor(list[i]));
    }
  }

  function tick(t: number) {
    frame = null;
    // A callback that was cancelled may still run (a test's manual clock does
    // it), and so may one that fires as the window hides.
    if (disposed || !visible) return;
    if (last !== null) world.step((t - last) / 1000);
    last = t;
    writeAll();
    frame = o.clock.request(tick);
  }

  function start() {
    if (frame === null && visible && !disposed) {
      frame = o.clock.request(tick);
    }
  }

  function stop() {
    if (frame !== null) o.clock.cancel(frame);
    frame = null;
    // The first frame after a resume steps 0 (6.3).
    last = null;
  }

  // `subscribeVisible` calls back only on a change, so the starting state is
  // read from `isVisible()`.
  const unsubscribe = o.visibility.subscribe((v) => {
    visible = v;
    if (v) start();
    else stop();
  });
  start();

  return {
    setBodies(ids, r = ICON_RADIUS.default) {
      // `bodies()` is the live array and `remove` splices it, so copy the ids.
      const old = world.bodies().map((b) => b.id);
      for (const id of old) world.remove(id);
      const points = spawnPositions(ids.length, bounds, r, rng);
      for (let i = 0; i < ids.length; i++) {
        world.add({ id: ids[i], x: points[i].x, y: points[i].y, r });
      }
      writeAll();
    },
    setBounds(rect) {
      world.setBounds(rect);
      bounds = rect;
    },
    grab: (id, point) => world.grab(id, point),
    moveGrab: (id, point) => world.moveGrab(id, point),
    release: (id, velocity) => world.release(id, velocity),
    bodies: () => world.bodies(),
    dispose() {
      if (disposed) return;
      stop();
      unsubscribe();
      disposed = true;
    },
  };
}
