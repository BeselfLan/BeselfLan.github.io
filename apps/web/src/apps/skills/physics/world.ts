import {
  createBody,
  type Body,
  type BodyId,
  type BodyInit,
  type BodyState,
  type Rect,
  type Vec,
} from "./body";
import { clampCenter, clampSpeed, resolvePair, resolveWalls } from "./collide";
import { DEFAULT_SEED, PHYSICS, type PhysicsConstants } from "./constants";
import { createRng } from "./rng";

// The physics of the Skills app (plan 4.6, 6.2 and Appendix C.2): circles that
// drift, bounce off each other and the walls, and can be grabbed. Pure
// TypeScript with no clock: the caller measures the time between frames and
// passes it to `step`. D7 lets a matter.js world replace this file without
// touching the app, as long as this interface stays the same.

/** The contract of plan 4.6. Adding or renaming a member is a contract change. */
export interface PhysicsWorld {
  /**
   * Takes effect in the next `step`, which pushes bodies inside. Throws on a
   * field that is not finite, and a negative width or height counts as 0.
   */
  setBounds(b: Rect): void;
  /** Throws on a duplicate id or a body that is not a usable circle. */
  add(body: BodyInit): void;
  /** An unknown id does nothing. The other bodies keep their order. */
  remove(id: BodyId): void;
  /**
   * Advances the world. A dt that is not above 0 (NaN, 0, negative) does
   * nothing, and a long dt is cut to the cap, so a tab that was in the
   * background cannot give a giant step.
   */
  step(dtSeconds: number): void;
  /**
   * Makes the body kinematic with infinite mass: it follows the pointer,
   * shoves other bodies and is not pushed back. The body keeps the pointer's
   * offset from its centre, so it does not jump. An unknown id, or a point that
   * is not finite, does nothing.
   */
  grab(id: BodyId, point: Vec): void;
  /** Moves a grabbed body's target. Does nothing for a body that is not grabbed. */
  moveGrab(id: BodyId, point: Vec): void;
  /**
   * Lets a grabbed body go with `velocity`, clamped to the max speed; a
   * component that is not finite counts as 0. Does nothing for a body that is
   * not grabbed.
   */
  release(id: BodyId, velocity: Vec): void;
  /**
   * The bodies in insertion order. It is the same array on every call, and
   * `step` changes the bodies in it, so read positions after each step.
   */
  bodies(): ReadonlyArray<Body>;
}

export interface WorldOptions {
  /** The room the bodies bounce in, in screen units. */
  bounds: Rect;
  /** An integer. The same seed and the same calls give the same run. */
  seed?: number;
  /** Replaces single values of PHYSICS (Appendix C.2). */
  constants?: Partial<PhysicsConstants>;
}

// A body plus what `step` needs per body, kept on the record so that `step`
// allocates nothing.
interface WorldBody extends BodyState {
  /** Wander acceleration, units/s^2. */
  ax: number;
  ay: number;
  /** Seconds until the wander is re-rolled. */
  wanderLeft: number;
  /** The centre minus the pointer at grab time. */
  offsetX: number;
  offsetY: number;
  /** A grabbed body's move per substep in this step. */
  dx: number;
  dy: number;
}

function checkedBounds(b: Rect): Rect {
  for (const key of ["x", "y", "width", "height"] as const) {
    if (!Number.isFinite(b[key])) {
      throw new Error(`setBounds: ${key} must be finite, got ${b[key]}`);
    }
  }
  return {
    x: b.x,
    y: b.y,
    width: Math.max(0, b.width),
    height: Math.max(0, b.height),
  };
}

export function createPhysicsWorld(options: WorldOptions): PhysicsWorld {
  const c: PhysicsConstants = { ...PHYSICS, ...options.constants };
  const rng = createRng(options.seed ?? DEFAULT_SEED);
  let bounds = checkedBounds(options.bounds);
  const list: WorldBody[] = [];
  const byId = new Map<BodyId, WorldBody>();

  function indexOf(id: BodyId): number {
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  return {
    setBounds(b) {
      bounds = checkedBounds(b);
    },

    add(init) {
      const base = createBody(init);
      if (byId.has(base.id)) {
        throw new Error(`add: a body with the id "${base.id}" already exists`);
      }
      const body: WorldBody = {
        ...base,
        ax: 0,
        ay: 0,
        // Staggered, so the icons do not change course in lockstep.
        wanderLeft: rng.next() * c.wanderPeriod,
        offsetX: 0,
        offsetY: 0,
        dx: 0,
        dy: 0,
      };
      clampSpeed(body, c.maxSpeed);
      list.push(body);
      byId.set(body.id, body);
    },

    remove(id) {
      if (!byId.delete(id)) return;
      list.splice(indexOf(id), 1);
    },

    grab(id, point) {
      const b = byId.get(id);
      if (!b || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      b.grabbed = true;
      b.offsetX = b.x - point.x;
      b.offsetY = b.y - point.y;
      // The target starts at the current centre: pointer plus offset.
      b.target = { x: b.x, y: b.y };
      b.vx = 0;
      b.vy = 0;
    },

    moveGrab(id, point) {
      const b = byId.get(id);
      if (!b?.grabbed || !b.target) return;
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      b.target.x = point.x + b.offsetX;
      b.target.y = point.y + b.offsetY;
    },

    release(id, velocity) {
      const b = byId.get(id);
      if (!b?.grabbed) return;
      b.grabbed = false;
      b.target = null;
      b.vx = Number.isFinite(velocity.x) ? velocity.x : 0;
      b.vy = Number.isFinite(velocity.y) ? velocity.y : 0;
      clampSpeed(b, c.maxSpeed);
    },

    bodies() {
      return list;
    },

    step(dtSeconds) {
      if (!(dtSeconds > 0)) return;
      const dt = dtSeconds > c.dtCap ? c.dtCap : dtSeconds;
      const n = c.substeps;
      const h = dt / n;
      const len = list.length;
      // 1 when the relaxation is off (dampingTau is Infinity).
      const decay = Math.exp(-h / c.dampingTau);

      // A grabbed body walks to its target, clamped inside the bounds, in n
      // equal moves.
      for (let i = 0; i < len; i++) {
        const b = list[i];
        const t = b.target;
        if (!b.grabbed || !t) continue;
        b.dx = (clampCenter(t.x, bounds.x, bounds.width, b.r) - b.x) / n;
        b.dy = (clampCenter(t.y, bounds.y, bounds.height, b.r) - b.y) / n;
      }

      for (let s = 0; s < n; s++) {
        // 1. Free bodies: wander, relax toward the idle speed, move.
        for (let i = 0; i < len; i++) {
          const b = list[i];
          if (b.grabbed) continue;
          b.wanderLeft -= h;
          if (b.wanderLeft <= 0) {
            b.ax = rng.range(-c.wanderAccel, c.wanderAccel);
            b.ay = rng.range(-c.wanderAccel, c.wanderAccel);
            b.wanderLeft += c.wanderPeriod;
          }
          b.vx += b.ax * h;
          b.vy += b.ay * h;
          if (decay !== 1) {
            const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            // From rest there is no direction yet, so draw one.
            let ux: number;
            let uy: number;
            if (speed < 1e-9) {
              const angle = rng.next() * 2 * Math.PI;
              ux = Math.cos(angle);
              uy = Math.sin(angle);
            } else {
              ux = b.vx / speed;
              uy = b.vy / speed;
            }
            // Slower than idle speeds up, faster slows down: it never stops.
            const relaxed = c.idleSpeed + (speed - c.idleSpeed) * decay;
            b.vx = ux * relaxed;
            b.vy = uy * relaxed;
          }
          b.x += b.vx * h;
          b.y += b.vy * h;
        }

        // 2. Grabbed bodies: kinematic. The last substep lands on the target
        // exactly, so the sum of the moves leaves no float drift.
        for (let i = 0; i < len; i++) {
          const b = list[i];
          const t = b.target;
          if (!b.grabbed || !t) continue;
          if (s === n - 1) {
            b.x = clampCenter(t.x, bounds.x, bounds.width, b.r);
            b.y = clampCenter(t.y, bounds.y, bounds.height, b.r);
          } else {
            b.x += b.dx;
            b.y += b.dy;
          }
          b.vx = b.dx / h;
          b.vy = b.dy / h;
        }

        // 3. Every pair, in insertion order.
        for (let i = 0; i < len; i++) {
          const a = list[i];
          for (let j = i + 1; j < len; j++) {
            resolvePair(a, list[j], c.restitutionBody, c.correction);
          }
        }

        // 4 and 5. Walls, then the speed limit, for free bodies. The walls
        // come after the collisions so that nothing is outside after a step.
        for (let i = 0; i < len; i++) {
          const b = list[i];
          if (b.grabbed) continue;
          resolveWalls(b, bounds, c.restitutionWall);
          clampSpeed(b, c.maxSpeed);
        }
      }
    },
  };
}
