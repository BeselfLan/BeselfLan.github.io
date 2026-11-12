// WCAG 2.x colour maths for the desktop's contrast tests (#146). Tests import
// it; no component does. Its name does not match vitest's `*.test.{ts,tsx}`
// include, so it never runs as a test of its own.
//
// axe cannot measure text over a background image or a gradient, and a
// translucent colour is only a ratio once it is composited over what is behind
// it. So the tests read the alphas from the component's own classes, composite,
// and ask for the ratio here.

/** A colour as red, green and blue, each from 0 to 255. */
export type Rgb = readonly [number, number, number];

/** `#rrggbb` or `#rgb` to RGB. Throws on anything else, so a typo is loud. */
export function hex(s: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) throw new Error(`not a hex colour: ${s}`);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** `fg` at `alpha` (0 to 1) over the opaque `bg`, straight alpha, per channel. */
export function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}

const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(rgb: Rgb): number {
  return (
    0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2])
  );
}

/** WCAG contrast ratio, 1 to 21, whichever colour is the lighter. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The alpha of a Tailwind opacity class: `NN` of the whole class
 * `prefix/NN`, as a fraction (`text-white/50` gives 0.5). Null when the class
 * list has none, so a test can tell "no scrim" from "a scrim".
 */
export function alphaOf(className: string, prefix: string): number | null {
  for (const cls of className.split(/\s+/)) {
    if (!cls.startsWith(`${prefix}/`)) continue;
    const n = cls.slice(prefix.length + 1);
    if (/^\d+$/.test(n)) return Number(n) / 100;
  }
  return null;
}
