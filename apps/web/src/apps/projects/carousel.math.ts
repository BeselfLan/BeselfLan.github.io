// The maths of the Projects carousel (plan 5.3, Appendix C.1, D8): the ring
// geometry, the depth styling, snapping, and a small motion model (wheel, drag,
// inertia, spring). Pure functions over plain numbers: no imports, no DOM, no
// store, no clock, no randomness, so it runs in a node test and renders nothing
// at import. The component (#83) owns the timers and the event listeners.
//
// Units: degrees for angles, seconds for `dt`, milliseconds for sample times,
// screen units for lengths. θ is `360 / n`, the angle between two items.
//
// Two departures from Appendix C.1 are on purpose, and each has its reason
// above the function. Override either by changing that one function.

export const CAROUSEL = {
  // Appendix C.1.
  itemWidth: 150,
  gap: 30,
  minRadius: 300,
  perspective: 1200,
  wheelDegPerPx: 0.15,
  // C.1's size. Its sign is flipped: see dragToRotation.
  dragDegPerUnit: 0.3,
  inertiaTau: 0.35,
  springStiffness: 170,
  springDamping: 26,
  // What C.1 leaves open. Inertia hands over to the spring below `snapOmega`
  // (deg/s). The ring is settled within `settleDeg` and `settleOmega`. `dtCap`
  // (s) and the release window (ms) follow C.2. `maxOmega` clamps a flick.
  snapOmega: 40,
  settleDeg: 0.05,
  settleOmega: 1,
  maxOmega: 1080,
  dtCap: 1 / 30,
  // For the component: the wheel snaps this long after its last event, a line
  // or page wheel delta counts as this many px, and a drag starts after this
  // many screen units (C.2's click threshold).
  wheelIdleMs: 120,
  wheelLinePx: 40,
  wheelPagePx: 800,
  dragThreshold: 4,
  releaseWindowMs: 80,
} as const;

const RAD = Math.PI / 180;

/** Rounds to three places so `-0` and `0.000` print as `0` in a transform. */
const n3 = (x: number): number => +x.toFixed(3);

/** A remainder that is never negative, so `-1` wraps to `m - 1`. */
const mod = (a: number, m: number): number => ((a % m) + m) % m;

/** The angle between two items, or 0 for an empty ring. */
export function ringTheta(n: number): number {
  return n >= 1 ? 360 / n : 0;
}

/**
 * C.1's radius, `(itemWidth + gap) / (2 sin(π/n))`, never below the floor. The
 * floor also covers n of 1 and 2, where the formula divides by sin(π) or
 * gives a ring smaller than one item.
 */
export function ringRadius(n: number): number {
  const { itemWidth, gap, minRadius } = CAROUSEL;
  if (n <= 2) return minRadius;
  return Math.max(minRadius, (itemWidth + gap) / (2 * Math.sin(Math.PI / n)));
}

export interface DepthStyle {
  scale: number;
  opacity: number;
  zIndex: number;
}

/** C.1: `d` is the cosine of the item's angle, 1 in front and -1 behind. */
export function depthStyle(d: number): DepthStyle {
  const k = (1 + d) / 2;
  return {
    scale: 0.7 + 0.3 * k,
    opacity: 0.35 + 0.65 * k,
    zIndex: Math.round(100 * (1 + d)),
  };
}

export interface ItemPose extends DepthStyle {
  /** The cosine of the item's angle, -1 to 1. */
  depth: number;
  transform: string;
}

/**
 * Where item `i` of `n` sits when the ring is turned by `rot`. With the
 * item's angle `a = i·θ + rot`, the transform is C.1's, plus the depth scale:
 * turn to the item's place, move out to the radius, turn back by `a` so the
 * item faces the viewer (so `rot` belongs in the counter-rotation too).
 *
 * There is no `translate(-50%, -50%)`: #83 centres the 150x150 item box on the
 * ring's axis with layout. A translate in this list would be turned by the
 * `rotateY` after it and shift the whole ring off-centre as it spins.
 */
export function itemPose(i: number, n: number, rot: number): ItemPose {
  const theta = ringTheta(n);
  const a = i * theta + rot;
  const depth = Math.cos(a * RAD);
  const style = depthStyle(depth);
  const transform =
    `rotateY(${n3(i * theta)}deg) translateZ(${n3(ringRadius(n))}px) ` +
    `rotateY(${n3(-a)}deg) scale(${n3(style.scale)})`;
  return { depth, ...style, transform };
}

/**
 * The ring's own transform. It starts with `translateZ(-R)`, which C.1 does
 * not have. Under C.1's bare `rotateY(rot)` and a 1200 px perspective, the
 * front item sits at z = +R and is magnified 1200 / (1200 - R): 1.46x at 13
 * items (R = 376) and 2.23x at 23 items (R = 661), and at 23 items the side
 * items project past the half-width of the 1040-unit window. Pushing the ring
 * back by its radius puts the front item at z = 0, so it is 1:1 and the whole
 * ring fits. Override: drop the `translateZ` and retune `perspective`.
 */
export function ringTransform(rot: number, n: number): string {
  return `translateZ(${n3(-ringRadius(n))}px) rotateY(${n3(rot)}deg)`;
}

/** The index of the item nearest the front, or -1 for an empty ring. */
export function frontIndex(rot: number, n: number): number {
  if (n <= 0) return -1;
  return mod(Math.round(-rot / ringTheta(n)), n);
}

/** `rot` rounded to the nearest whole item. */
export function snapRotation(rot: number, n: number): number {
  if (n <= 0) return rot;
  const theta = ringTheta(n);
  return theta * Math.round(rot / theta);
}

/**
 * The rotation that puts `index` at the front and is nearest `rot`: the ring
 * takes the shortest way round and keeps its turn count.
 */
export function rotationForIndex(
  index: number,
  rot: number,
  n: number,
): number {
  if (n <= 0) return rot;
  const base = -index * ringTheta(n);
  return base + 360 * Math.round((rot - base) / 360);
}

/**
 * C.1: `rot -= delta * 0.15`, on the larger of the two axes. `deltaMode` is 0
 * for px, 1 for lines and 2 for pages, as on a WheelEvent.
 */
export function wheelToRotation(e: {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}): number {
  const { wheelDegPerPx, wheelLinePx, wheelPagePx } = CAROUSEL;
  let px = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (e.deltaMode === 1) px *= wheelLinePx;
  else if (e.deltaMode === 2) px *= wheelPagePx;
  return -px * wheelDegPerPx;
}

/**
 * How far a horizontal drag of `dxClient` px turns the ring. The size is C.1's,
 * `0.3 / scale`, but the sign is not. C.1 writes `rot -= dx / scale * 0.3`.
 * Under C.1's own transforms an item at angle `a` sits at x = R·sin(a), so a
 * growing `rot` moves the front item to the right, and C.1's minus would turn
 * the ring against the pointer. With a plus, dragging left brings the next item
 * to the front, as wheel-down and ArrowRight do, and the ring follows the
 * pointer. Override: negate the result.
 *
 * `scale` is the screen's scale; one that is not a positive number counts as 1.
 */
export function dragToRotation(dxClient: number, scale: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return (dxClient / s) * CAROUSEL.dragDegPerUnit;
}

export interface Sample {
  /** Milliseconds. */
  t: number;
  rot: number;
}

/**
 * The speed at release, in deg/s, from the samples of the last 80 ms. The
 * samples are in time order. Fewer than two of them, or no time between them,
 * mean the pointer was held still: 0.
 */
export function releaseOmega(samples: readonly Sample[], now: number): number {
  const recent = samples.filter((s) => s.t >= now - CAROUSEL.releaseWindowMs);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const seconds = (last.t - first.t) / 1000;
  return seconds > 0 ? (last.rot - first.rot) / seconds : 0;
}

export type MotionMode = "idle" | "drag" | "inertia" | "spring";

export interface Motion {
  rot: number;
  /** Degrees per second. */
  omega: number;
  mode: MotionMode;
  /** Where the spring is heading. */
  target: number;
}

export const REST: Readonly<Motion> = Object.freeze({
  rot: 0,
  omega: 0,
  mode: "idle",
  target: 0,
});

/**
 * Lets go at speed `omega`. Reduced motion jumps to the nearest item. A slow
 * release springs to the nearest item, a fast one coasts first.
 */
export function release(
  m: Motion,
  omega: number,
  n: number,
  reduced: boolean,
): Motion {
  if (reduced) {
    const s = snapRotation(m.rot, n);
    return { rot: s, omega: 0, mode: "idle", target: s };
  }
  const { maxOmega, snapOmega } = CAROUSEL;
  const w = Number.isFinite(omega)
    ? Math.min(Math.max(omega, -maxOmega), maxOmega)
    : 0;
  if (Math.abs(w) < snapOmega) {
    return {
      rot: m.rot,
      omega: w,
      mode: "spring",
      target: snapRotation(m.rot, n),
    };
  }
  return { rot: m.rot, omega: w, mode: "inertia", target: m.target };
}

/**
 * Springs to `target`, keeping the speed so a retarget mid-flight stays
 * smooth. Reduced motion is already there.
 */
export function springTo(m: Motion, target: number, reduced: boolean): Motion {
  if (reduced) return { rot: target, omega: 0, mode: "idle", target };
  return { ...m, mode: "spring", target };
}

/**
 * Where an arrow key or a click `delta` items on from the front sends the ring
 * (a positive delta is the next item, so the target goes down). It starts from
 * the spring's target while one runs, so two quick presses move two items.
 */
export function stepTarget(m: Motion, delta: number, n: number): number {
  if (n <= 0) return m.rot;
  const from = m.mode === "spring" ? m.target : snapRotation(m.rot, n);
  return from - delta * ringTheta(n);
}

/**
 * Advances the motion by `dt` seconds, capped at 1/30 s so a stalled frame
 * cannot throw the ring. Idle and drag are returned as they are.
 *
 * Inertia decays the speed by `exp(-dt / tau)` and hands over to the spring
 * once it is slow. The spring is semi-implicit Euler: speed first, then
 * position. At 1/60 s its two eigenvalues are real, so it cannot overshoot.
 */
export function stepMotion(m: Motion, dt: number, n: number): Motion {
  if (m.mode === "idle" || m.mode === "drag") return m;
  const {
    dtCap,
    inertiaTau,
    snapOmega,
    springStiffness,
    springDamping,
    settleDeg,
    settleOmega,
  } = CAROUSEL;
  const h = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), dtCap) : 0;

  if (m.mode === "inertia") {
    const omega = m.omega * Math.exp(-h / inertiaTau);
    const rot = m.rot + omega * h;
    if (Math.abs(omega) < snapOmega) {
      return { rot, omega, mode: "spring", target: snapRotation(rot, n) };
    }
    return { rot, omega, mode: "inertia", target: m.target };
  }

  const omega =
    m.omega +
    (-springStiffness * (m.rot - m.target) - springDamping * m.omega) * h;
  const rot = m.rot + omega * h;
  if (Math.abs(rot - m.target) < settleDeg && Math.abs(omega) < settleOmega) {
    return { rot: m.target, omega: 0, mode: "idle", target: m.target };
  }
  return { rot, omega, mode: "spring", target: m.target };
}
