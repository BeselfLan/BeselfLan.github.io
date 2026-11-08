import { inverseMass, type BodyState, type Rect } from "./body";

// Collision between circles and with the walls. Pure functions that change
// the bodies they are given and allocate nothing, because the world calls them
// for every pair on every substep.

/**
 * Separates two overlapping circles and bounces them. A body that is not
 * overlapping is left alone. Positions move by `correction` (0 to 1) of the
 * overlap, shared by inverse mass, so the lighter body moves further. Then an
 * elastic impulse with `restitution` acts on the approach speed along the
 * line of centres, and only if the bodies are approaching. A grabbed body has
 * inverse mass 0: it neither moves nor changes speed. Coincident centres
 * separate along +x, so no division by zero gives NaN.
 */
export function resolvePair(
  a: BodyState,
  b: BodyState,
  restitution: number,
  correction: number,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const touch = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= touch * touch) return;

  const ia = inverseMass(a);
  const ib = inverseMass(b);
  const sum = ia + ib;
  if (sum === 0) return;

  const d = Math.sqrt(d2);
  const nx = d < 1e-9 ? 1 : dx / d;
  const ny = d < 1e-9 ? 0 : dy / d;

  const push = ((touch - d) * correction) / sum;
  a.x -= nx * push * ia;
  a.y -= ny * push * ia;
  b.x += nx * push * ib;
  b.y += ny * push * ib;

  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn < 0) {
    const j = (-(1 + restitution) * vn) / sum;
    a.vx -= j * ia * nx;
    a.vy -= j * ia * ny;
    b.vx += j * ib * nx;
    b.vy += j * ib * ny;
  }
}

/**
 * The centre that keeps a circle of radius `r` inside the span that starts at
 * `start` and is `length` long. A span narrower than the circle gives its
 * middle.
 */
export function clampCenter(
  value: number,
  start: number,
  length: number,
  r: number,
): number {
  const lo = start + r;
  const hi = start + length - r;
  if (lo > hi) return start + length / 2;
  return value < lo ? lo : value > hi ? hi : value;
}

/**
 * Puts a body back inside `bounds` and reflects the velocity component that
 * points out of the wall, scaled by `restitution`. A component that already
 * points inward is kept. On an axis narrower than the body, the body sits in
 * the middle with no velocity on that axis. The position is clamped, not just
 * the velocity flipped, so even a fast body cannot be outside afterwards.
 */
export function resolveWalls(
  b: BodyState,
  bounds: Rect,
  restitution: number,
): void {
  const loX = bounds.x + b.r;
  const hiX = bounds.x + bounds.width - b.r;
  if (loX > hiX) {
    b.x = bounds.x + bounds.width / 2;
    b.vx = 0;
  } else if (b.x < loX) {
    b.x = loX;
    if (b.vx < 0) b.vx = -b.vx * restitution;
  } else if (b.x > hiX) {
    b.x = hiX;
    if (b.vx > 0) b.vx = -b.vx * restitution;
  }

  const loY = bounds.y + b.r;
  const hiY = bounds.y + bounds.height - b.r;
  if (loY > hiY) {
    b.y = bounds.y + bounds.height / 2;
    b.vy = 0;
  } else if (b.y < loY) {
    b.y = loY;
    if (b.vy < 0) b.vy = -b.vy * restitution;
  } else if (b.y > hiY) {
    b.y = hiY;
    if (b.vy > 0) b.vy = -b.vy * restitution;
  }
}

/** Scales the velocity down to `max` when it is faster, keeping the direction. */
export function clampSpeed(b: BodyState, max: number): void {
  const s2 = b.vx * b.vx + b.vy * b.vy;
  if (s2 > max * max) {
    const scale = max / Math.sqrt(s2);
    b.vx *= scale;
    b.vy *= scale;
  }
}
