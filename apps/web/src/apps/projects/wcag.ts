// WCAG 2.x contrast, for tests. They check the tile palette and the drawn
// icons with it; no component imports this file.

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Relative luminance of a `#RRGGBB` colour. Throws on any other form. */
export function relativeLuminance(hex: string): number {
  if (!HEX.test(hex)) throw new Error(`expected #RRGGBB, got "${hex}"`);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * `fg` at `alpha` (0 to 1) over `bg`, as a rounded `#rrggbb`: what `opacity`
 * makes of a colour on a flat background, so `contrastRatio` can take it.
 * Throws on any form but `#RRGGBB`.
 */
export function over(fg: string, alpha: number, bg: string): string {
  for (const hex of [fg, bg]) {
    if (!HEX.test(hex)) throw new Error(`expected #RRGGBB, got "${hex}"`);
  }
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  const mixed = [1, 3, 5].map((i) =>
    Math.round(channel(fg, i) * alpha + channel(bg, i) * (1 - alpha)),
  );
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** (lighter + 0.05) / (darker + 0.05): 1 to 21, the same either way round. */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
