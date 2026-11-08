// A seedable random number generator (plan 6.2), so a run can be repeated.

export interface Rng {
  /** A number in [0, 1). */
  next(): number;
  /** A number in [min, max). */
  range(min: number, max: number): number;
}

/**
 * Mulberry32: a 32-bit generator with a one-word state. Seeds are integers;
 * the seed is taken modulo 2^32. The Skills app makes one with
 * `(Math.random() * 2 ** 32) >>> 0` inside an effect, never at import or
 * during render. Throws on a seed that is not finite.
 */
export function createRng(seed: number): Rng {
  if (!Number.isFinite(seed)) {
    throw new Error(`createRng: the seed must be finite, got ${seed}`);
  }
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
  };
}
