// The numbers of the Skills physics (plan Appendix C.2). Speeds are in screen
// units per second and lengths in screen units (plan 3.4), so a "px/s" in the
// plan is a screen unit per second here. Nothing in this folder imports from
// the OS or from React.

export interface PhysicsConstants {
  /** Longest time one step may advance, in seconds. A longer dt is cut to it. */
  dtCap: number;
  /** Equal parts one step is split into. */
  substeps: number;
  /** Bounce of one icon off another, 0 to 1. */
  restitutionBody: number;
  /** Bounce of an icon off a wall, 0 to 1. */
  restitutionWall: number;
  /** Speed an icon relaxes to and then keeps, so it never stops drifting. */
  idleSpeed: number;
  /** No icon is ever faster than this. */
  maxSpeed: number;
  /**
   * Time constant in seconds of the relaxation toward `idleSpeed`. `Infinity`
   * turns it off: `Math.exp(-h / Infinity)` is 1, which the tests use.
   */
  dampingTau: number;
  /** Wander acceleration per axis, uniform in [-wanderAccel, wanderAccel]. */
  wanderAccel: number;
  /** Seconds between two re-rolls of a body's wander. */
  wanderPeriod: number;
  /** Share of an overlap removed per substep, 0 to 1. */
  correction: number;
}

/** Appendix C.2. */
export const PHYSICS: Readonly<PhysicsConstants> = {
  dtCap: 1 / 30,
  substeps: 3,
  restitutionBody: 0.95,
  restitutionWall: 0.9,
  idleSpeed: 20,
  maxSpeed: 2500,
  dampingTau: 0.9,
  wanderAccel: 15,
  wanderPeriod: 0.5,
  correction: 0.8,
};

/**
 * The seed `createPhysicsWorld` uses when the caller gives none. The caller
 * picks its own when it wants a different layout: nothing here draws a random
 * number at import (plan 9, hydration).
 */
export const DEFAULT_SEED = 1;

/** Icon radius in screen units: 56 across, or 48 in the fullscreen mode (C.2). */
export const ICON_RADIUS = { default: 28, fullscreen: 24 } as const;

/**
 * Pointer handling that the Skills app owns (C.2). The world does not use
 * these; they live here so the numbers have one home. A click is a press that
 * moved less than `clickMaxTravel` units and lasted less than `clickMaxMs`. A
 * release velocity is the mean of the last `releaseSamples` pointer samples
 * that are at most `releaseWindowMs` old.
 */
export const INTERACTION = {
  clickMaxTravel: 4,
  clickMaxMs: 250,
  releaseWindowMs: 80,
  releaseSamples: 8,
} as const;
