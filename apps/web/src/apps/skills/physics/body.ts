// The bodies of the Skills physics (plan 6.2): circles with a position, a
// velocity and a mass. Screen units, top-left origin (plan 3.4).

export interface Vec {
  x: number;
  y: number;
}

/** A box in screen units, from its top-left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Any non-empty string; the Skills app uses the skill's id. */
export type BodyId = string;

/** What `add` takes. The velocity defaults to 0. */
export interface BodyInit {
  id: BodyId;
  /** Centre. */
  x: number;
  y: number;
  /** Radius, above 0. */
  r: number;
  vx?: number;
  vy?: number;
}

/** A body as the engine changes it. */
export interface BodyState {
  id: BodyId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** r * r: a circle's area up to a constant. */
  mass: number;
  /** A grabbed body is kinematic: it follows its target and has infinite mass. */
  grabbed: boolean;
  /** Where a grabbed body is heading; null when it is not grabbed. */
  target: Vec | null;
}

/** What `bodies()` shows: the same objects, read-only. */
export type Body = Readonly<BodyState>;

/** Throws an Error that names the id when the init is not a usable circle. */
export function createBody(init: BodyInit): BodyState {
  const { id, x, y, r, vx = 0, vy = 0 } = init;
  if (typeof id !== "string" || id === "") {
    throw new Error("body: the id must be a non-empty string");
  }
  for (const [name, value] of [
    ["x", x],
    ["y", y],
    ["vx", vx],
    ["vy", vy],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`body "${id}": ${name} must be finite, got ${value}`);
    }
  }
  if (!Number.isFinite(r) || r <= 0) {
    throw new Error(`body "${id}": r must be finite and above 0, got ${r}`);
  }
  return { id, x, y, vx, vy, r, mass: r * r, grabbed: false, target: null };
}

/** 0 for a grabbed body, so every impulse and push leaves it where it is. */
export function inverseMass(b: BodyState): number {
  return b.grabbed ? 0 : 1 / b.mass;
}
