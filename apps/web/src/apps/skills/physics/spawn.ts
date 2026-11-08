import type { Rect, Vec } from "./body";
import type { Rng } from "./rng";

/**
 * Centres for `count` circles of radius `r`: a hex-ish grid with jitter
 * (Appendix C.2), for the first layout and for a re-seed when the set of
 * bodies changes. The points run row by row from the top left, and every
 * other row is shifted half a cell, so the grid looks scattered and not
 * ruled. The same rng state gives the same points.
 *
 * Every centre is inside `bounds` inset by `r`. The grid has about the same
 * shape as the bounds, and the jitter is at most a quarter of the room a cell
 * has beyond the icon, so while a cell is wider and taller than `2r` no two
 * circles overlap. When `count` is too big for that, the jitter is 0 and the
 * points are as spread as the area allows: they overlap, are finite and stay
 * inside, and the world pushes them apart.
 */
export function spawnPositions(
  count: number,
  bounds: Rect,
  r: number,
  rng: Rng,
): Vec[] {
  if (!(count >= 1)) return [];

  // The area the centres may use.
  const w = Math.max(0, bounds.width - 2 * r);
  const h = Math.max(0, bounds.height - 2 * r);

  // Columns so that the cells are about as wide as they are tall.
  const cols =
    h === 0
      ? count
      : w === 0
        ? 1
        : Math.min(count, Math.max(1, Math.ceil(Math.sqrt((count * w) / h))));
  const rows = Math.ceil(count / cols);
  const cw = w / cols;
  const ch = h / rows;
  // The last row may be partial: it is centred under the rows above it.
  const last = count - (rows - 1) * cols;
  const jitter = Math.max(0, (Math.min(cw, ch) - 2 * r) / 4);

  const points: Vec[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i - row * cols;
    const lead = row === rows - 1 ? (cols - last) / 2 : 0;
    const hex = rows === 1 ? 0 : row % 2 === 0 ? -0.25 : 0.25;
    points.push({
      x:
        bounds.x +
        r +
        (col + lead + 0.5 + hex) * cw +
        rng.range(-jitter, jitter),
      y: bounds.y + r + (row + 0.5) * ch + rng.range(-jitter, jitter),
    });
  }
  return points;
}
