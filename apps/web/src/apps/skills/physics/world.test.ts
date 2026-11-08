// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Body, Rect } from "./body";
import type { PhysicsConstants } from "./constants";
import { createRng } from "./rng";
import { spawnPositions } from "./spawn";
import { createPhysicsWorld, type PhysicsWorld } from "./world";

// All runs are seeded. Speeds are screen units per second. B is the main
// bounds of the Skills app: the 1000x620 window minus its 40-unit title bar.
const B: Rect = { x: 0, y: 0, width: 1000, height: 580 };
const R = 28;

function make(
  bounds: Rect = B,
  constants: Partial<PhysicsConstants> = {},
  seed = 1234,
): PhysicsWorld {
  return createPhysicsWorld({ bounds, seed, constants });
}

/** Steps `seconds` of simulated time at 60 frames per second. */
function run(w: PhysicsWorld, seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) w.step(dt);
}

function find(w: PhysicsWorld, id: string): Body {
  const b = w.bodies().find((x) => x.id === id);
  if (!b) throw new Error(`no body "${id}"`);
  return b;
}

/** Grabs the body at its own centre and lets go with this velocity. */
function flick(w: PhysicsWorld, id: string, vx: number, vy: number): void {
  const b = find(w, id);
  w.grab(id, { x: b.x, y: b.y });
  w.release(id, { x: vx, y: vy });
}

const speed = (b: Body): number => Math.hypot(b.vx, b.vy);

/** The largest ra + rb - d over all pairs; 0 or less means no overlap. */
function maxOverlap(bodies: ReadonlyArray<Body>): number {
  let worst = -Infinity;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      worst = Math.max(worst, a.r + b.r - Math.hypot(b.x - a.x, b.y - a.y));
    }
  }
  return worst;
}

/** Every body is finite and inside the rect inset by its radius. */
function assertInside(bodies: ReadonlyArray<Body>, rect: Rect): void {
  for (const b of bodies) {
    for (const v of [b.x, b.y, b.vx, b.vy]) {
      if (!Number.isFinite(v)) throw new Error(`${b.id} is not finite`);
    }
    const ok =
      b.x >= rect.x + b.r - 1e-9 &&
      b.x <= rect.x + rect.width - b.r + 1e-9 &&
      b.y >= rect.y + b.r - 1e-9 &&
      b.y <= rect.y + rect.height - b.r + 1e-9;
    if (!ok) {
      throw new Error(`${b.id} is outside: (${b.x}, ${b.y}) r ${b.r}`);
    }
  }
}

/** `count` bodies on the spawn grid, ids s0, s1, ... */
function addSpawned(
  w: PhysicsWorld,
  count: number,
  bounds: Rect = B,
  r = R,
  spawnSeed = 77,
): void {
  const points = spawnPositions(count, bounds, r, createRng(spawnSeed));
  points.forEach((p, i) => w.add({ id: `s${i}`, x: p.x, y: p.y, r }));
}

describe("the issue's physics lines", () => {
  it("two equal bodies head-on swap velocities", () => {
    const w = make(
      { x: 0, y: 0, width: 1440, height: 900 },
      { restitutionBody: 1, wanderAccel: 0, dampingTau: Infinity },
    );
    w.add({ id: "a", x: 400, y: 450, r: R, vx: 300 });
    w.add({ id: "b", x: 600, y: 450, r: R, vx: -100 });
    run(w, 1);
    // Unequal speeds: an engine that only reverses each gives -300 and 100.
    expect(find(w, "a").vx).toBeCloseTo(-100, 6);
    expect(find(w, "b").vx).toBeCloseTo(300, 6);
    expect(find(w, "a").vy).toBeCloseTo(0, 6);
    expect(find(w, "b").vy).toBeCloseTo(0, 6);
  });

  it("with the default constants the faster body leaves faster", () => {
    const w = make();
    w.add({ id: "a", x: 400, y: 290, r: R, vx: 300 });
    w.add({ id: "b", x: 600, y: 290, r: R, vx: -100 });
    run(w, 0.6);
    const a = find(w, "a");
    const b = find(w, "b");
    // A reversing engine would give about -163 and +61.
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
    expect(b.vx).toBeGreaterThan(1.5 * Math.abs(a.vx));
  });

  it("from a deliberately overlapped start, no pair overlaps after 2 s", () => {
    const bounds: Rect = { x: 0, y: 0, width: 600, height: 400 };
    const w = make(bounds);
    w.add({ id: "b0", x: 300, y: 200, r: R });
    w.add({ id: "b1", x: 300, y: 200, r: R });
    const j = createRng(77);
    for (let i = 2; i < 20; i++) {
      w.add({
        id: `b${i}`,
        x: 300 + j.range(-30, 30),
        y: 200 + j.range(-30, 30),
        r: R,
      });
    }
    run(w, 2);
    expect(maxOverlap(w.bodies())).toBeLessThanOrEqual(0.5);
    assertInside(w.bodies(), bounds);
  });

  it("a 2500 px/s flick decays to under 5% excess speed within 4 s", () => {
    const w = make();
    w.add({ id: "f", x: 500, y: 290, r: R });
    const excess = () => (speed(find(w, "f")) - 20) / (2500 - 20);
    flick(w, "f", 2500 * Math.cos(Math.PI / 6), 2500 * Math.sin(Math.PI / 6));
    run(w, 1);
    // Not already at the idle speed: the decay takes time.
    expect(excess()).toBeGreaterThan(0.15);
    run(w, 3);
    expect(excess()).toBeLessThan(0.05);
  });

  it("after 10 s at max speed every body is inside bounds", () => {
    const w = make(B, { dampingTau: Infinity, wanderAccel: 0 });
    addSpawned(w, 40);
    const k = createRng(4242);
    for (let step = 0; step < 300; step++) {
      // Every 15 steps all bodies are thrown at the top speed, in any direction.
      if (step % 15 === 0) {
        for (const b of w.bodies()) {
          const angle = k.range(0, 2 * Math.PI);
          flick(w, b.id, 2500 * Math.cos(angle), 2500 * Math.sin(angle));
        }
      }
      // The dt cap: 27.8 units per substep, the worst legal case.
      w.step(1 / 30);
      assertInside(w.bodies(), B);
    }
  });

  it.each([40, 48])("%i bodies step in under 1 ms on average", (count) => {
    const w = make();
    addSpawned(w, count);
    run(w, 2); // warm up: 120 steps
    const steps = 600;
    const start = performance.now();
    for (let i = 0; i < steps; i++) w.step(1 / 60);
    const mean = (performance.now() - start) / steps;
    expect(mean).toBeLessThan(1);
  });
});

describe("the rest of the behaviour", () => {
  it("same seed, same run; different seed, different run", () => {
    const worlds = [1234, 1234, 5678].map((seed) => {
      const w = make(B, {}, seed);
      addSpawned(w, 10);
      run(w, 5);
      return w;
    });
    expect(worlds[0].bodies()).toEqual(worlds[1].bodies());
    expect(worlds[0].bodies()).not.toEqual(worlds[2].bodies());
  });

  it("a body at rest drifts at the idle speed", () => {
    const w = make(B, { wanderAccel: 0 });
    w.add({ id: "r", x: 500, y: 290, r: R });
    run(w, 3);
    const s = speed(find(w, "r"));
    expect(s).toBeGreaterThanOrEqual(18);
    expect(s).toBeLessThanOrEqual(20.5);
  });

  it("wander moves a body that has no other motion", () => {
    const wandering = make(B, { dampingTau: Infinity });
    const still = make(B, { dampingTau: Infinity, wanderAccel: 0 });
    for (const w of [wandering, still]) {
      w.add({ id: "r", x: 500, y: 290, r: R });
      run(w, 2);
    }
    const moved = (w: PhysicsWorld) =>
      Math.hypot(find(w, "r").x - 500, find(w, "r").y - 290);
    expect(moved(wandering)).toBeGreaterThan(0.01);
    expect(moved(still)).toBeLessThan(1e-3);
  });

  it("a body that has stopped on a wall keeps drifting", () => {
    const w = make(B, { wanderAccel: 0 });
    w.add({ id: "r", x: 28, y: 290, r: R, vx: -20 });
    run(w, 6);
    expect(speed(find(w, "r"))).toBeGreaterThan(15);
  });

  it("a grabbed body follows the pointer and keeps its offset", () => {
    const w = make();
    w.add({ id: "g", x: 400, y: 290, r: R });
    w.grab("g", { x: 410, y: 295 });
    w.step(1 / 60);
    expect(find(w, "g").x).toBeCloseTo(400, 9);
    expect(find(w, "g").y).toBeCloseTo(290, 9);
    expect(find(w, "g").grabbed).toBe(true);

    w.moveGrab("g", { x: 510, y: 295 });
    w.step(1 / 60);
    // Snapping to the pointer would be off by (10, 5).
    expect(find(w, "g").x).toBeCloseTo(500, 9);
    expect(find(w, "g").y).toBeCloseTo(290, 9);
  });

  it("a grabbed body shoves others and is not pushed back", () => {
    const w = make();
    w.add({ id: "a", x: 400, y: 290, r: R });
    w.add({ id: "b", x: 500, y: 290, r: R });
    w.grab("a", { x: 400, y: 290 });
    w.moveGrab("a", { x: 470, y: 290 });
    w.step(1 / 60);
    const b = find(w, "b");
    expect(find(w, "a").x).toBeCloseTo(470, 9);
    expect(b.x).toBeGreaterThan(500);
    expect(b.vx).toBeGreaterThan(0);
    // Without the clamp at the end of a substep b would leave at about 8190.
    expect(speed(b)).toBeLessThanOrEqual(2500 + 1e-9);

    run(w, 10 / 60);
    expect(find(w, "a").x).toBeCloseTo(470, 9);
  });

  it("a grab target outside the bounds is clamped inside", () => {
    const w = make();
    w.add({ id: "g", x: 400, y: 290, r: R });
    w.grab("g", { x: 400, y: 290 });
    w.moveGrab("g", { x: -900, y: 5000 });
    w.step(1 / 60);
    expect(find(w, "g").x).toBeCloseTo(28, 9);
    expect(find(w, "g").y).toBeCloseTo(552, 9);
  });

  it("release clamps to the max speed", () => {
    const w = make();
    w.add({ id: "f", x: 500, y: 290, r: R });
    flick(w, "f", 6000, 0);
    expect(find(w, "f").vx).toBeCloseTo(2500, 9);
    expect(find(w, "f").vy).toBeCloseTo(0, 9);
    expect(find(w, "f").grabbed).toBe(false);
    expect(find(w, "f").target).toBeNull();

    flick(w, "f", NaN, 0);
    expect(find(w, "f").vx).toBe(0);
    expect(find(w, "f").vy).toBe(0);
  });

  it("add clamps a body that starts faster than the max speed", () => {
    const w = make();
    w.add({ id: "f", x: 500, y: 290, r: R, vx: 9000 });
    expect(speed(find(w, "f"))).toBeCloseTo(2500, 9);
  });

  it("release and moveGrab on a body that is not grabbed do nothing", () => {
    const w = make();
    w.add({ id: "f", x: 500, y: 290, r: R, vx: 50, vy: -30 });
    const before = structuredClone(find(w, "f"));
    w.moveGrab("f", { x: 10, y: 10 });
    w.release("f", { x: 900, y: 900 });
    expect(find(w, "f")).toEqual(before);
  });

  it("a grab with a point that is not finite does nothing", () => {
    const w = make();
    w.add({ id: "f", x: 500, y: 290, r: R });
    w.grab("f", { x: NaN, y: 0 });
    expect(find(w, "f").grabbed).toBe(false);
    w.grab("f", { x: 500, y: 290 });
    w.moveGrab("f", { x: Infinity, y: 0 });
    w.step(1 / 60);
    assertInside(w.bodies(), B);
  });

  it("a sudden shrink pushes every body inside within one step", () => {
    const w = make();
    addSpawned(w, 45);
    run(w, 1);
    w.setBounds({ x: 0, y: 0, width: 660, height: 580 });
    w.step(1 / 60);
    for (const b of w.bodies())
      expect(b.x + b.r).toBeLessThanOrEqual(660 + 1e-9);
    assertInside(w.bodies(), { x: 0, y: 0, width: 660, height: 580 });
  });

  it("an animated 250 ms shrink leaves no overlaps", () => {
    const w = make();
    addSpawned(w, 45);
    run(w, 1);
    // The panel opens: 15 frames, each moving the wall.
    for (let k = 1; k <= 15; k++) {
      w.setBounds({ x: 0, y: 0, width: 1000 - (340 * k) / 15, height: 580 });
      w.step(1 / 60);
    }
    run(w, 2);
    expect(maxOverlap(w.bodies())).toBeLessThanOrEqual(0.5);
    assertInside(w.bodies(), { x: 0, y: 0, width: 660, height: 580 });
  });

  it("growing the bounds back lets the bodies spread out", () => {
    const w = make(B);
    addSpawned(w, 20, { x: 0, y: 0, width: 660, height: 580 });
    w.setBounds({ x: 0, y: 0, width: 660, height: 580 });
    run(w, 1);
    w.setBounds(B);
    run(w, 6);
    assertInside(w.bodies(), B);
    expect(Math.max(...w.bodies().map((b) => b.x))).toBeGreaterThan(660);
  });

  it("bounds narrower than an icon centre it", () => {
    const w = make({ x: 0, y: 0, width: 40, height: 580 });
    w.add({ id: "f", x: 300, y: 290, r: R, vx: 100 });
    w.step(1 / 60);
    expect(find(w, "f").x).toBe(20);
    expect(Number.isFinite(find(w, "f").y)).toBe(true);
    expect(find(w, "f").vx).toBe(0);
  });

  it("setBounds validates and clamps", () => {
    const w = make();
    expect(() => w.setBounds({ x: 0, y: 0, width: NaN, height: 10 })).toThrow();
    expect(() =>
      w.setBounds({ x: 0, y: 0, width: 10, height: Infinity }),
    ).toThrow();
    // A negative size counts as 0, so the body sits in the middle.
    w.add({ id: "f", x: 300, y: 290, r: R });
    w.setBounds({ x: 10, y: 20, width: -5, height: -5 });
    w.step(1 / 60);
    expect(find(w, "f").x).toBe(10);
    expect(find(w, "f").y).toBe(20);
  });

  it("step ignores bad dt and caps large ones", () => {
    const w = make();
    addSpawned(w, 5);
    run(w, 0.5);
    const before = structuredClone(w.bodies());
    for (const dt of [NaN, -1, 0, -Infinity]) {
      w.step(dt);
      expect(w.bodies(), `dt ${dt}`).toEqual(before);
    }

    // A long step is the same as one at the cap.
    const twins = [0.5, 1 / 30, Infinity].map((dt) => {
      const t = make();
      addSpawned(t, 5);
      t.step(dt);
      return t;
    });
    expect(twins[0].bodies()).toEqual(twins[1].bodies());
    expect(twins[2].bodies()).toEqual(twins[1].bodies());
  });

  it("add validates, unknown ids are no-ops, bodies() is stable", () => {
    const w = make();
    w.add({ id: "a", x: 100, y: 100, r: R });
    w.add({ id: "b", x: 300, y: 100, r: R });
    w.add({ id: "c", x: 500, y: 100, r: R });
    expect(() => w.add({ id: "a", x: 200, y: 200, r: R })).toThrow(/"a"/);
    expect(w.bodies()).toHaveLength(3);
    for (const r of [0, -1, NaN]) {
      expect(() => w.add({ id: "bad", x: 10, y: 10, r })).toThrow();
    }
    expect(w.bodies()).toHaveLength(3);

    expect(() => {
      w.remove("nope");
      w.grab("nope", { x: 0, y: 0 });
      w.moveGrab("nope", { x: 0, y: 0 });
      w.release("nope", { x: 0, y: 0 });
    }).not.toThrow();

    const list = w.bodies();
    expect(w.bodies()).toBe(list);
    run(w, 0.1);
    expect(w.bodies()).toBe(list);
    expect(list.map((b) => b.mass)).toEqual([R * R, R * R, R * R]);

    // Removal keeps the order of the rest, and the id can be added again.
    w.remove("b");
    expect(w.bodies().map((b) => b.id)).toEqual(["a", "c"]);
    w.add({ id: "b", x: 300, y: 100, r: R });
    expect(w.bodies().map((b) => b.id)).toEqual(["a", "c", "b"]);
  });

  it("removing a grabbed body is safe", () => {
    const w = make();
    w.add({ id: "g", x: 300, y: 100, r: R });
    w.grab("g", { x: 300, y: 100 });
    w.remove("g");
    expect(() => {
      w.moveGrab("g", { x: 1, y: 1 });
      w.release("g", { x: 1, y: 1 });
      w.step(1 / 60);
    }).not.toThrow();
    expect(w.bodies()).toHaveLength(0);
  });

  it("an empty world steps", () => {
    const w = make();
    expect(() => run(w, 1)).not.toThrow();
  });

  it("48 bodies on one point spread out with no NaN", () => {
    const w = make();
    for (let i = 0; i < 48; i++) {
      w.add({ id: `c${i}`, x: 500, y: 290, r: R });
    }
    run(w, 5);
    assertInside(w.bodies(), B);
    expect(maxOverlap(w.bodies())).toBeLessThanOrEqual(0.5);
  });
});
