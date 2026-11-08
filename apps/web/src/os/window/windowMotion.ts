import type { MotionConfigProps, Variants } from "motion/react";
import type { ScreenValue } from "../screen/Screen";
import type { Settings } from "../store/settings";
import type { IconRect } from "./iconRect";

/** A rect in screen units: the virtual 1440x900 space windows live in. */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A translation and a scale, relative to where the window rests. */
export interface Fly {
  x: number;
  y: number;
  scale: number;
}

/** What the variants read. `fly` runs only when a minimise starts. */
export interface SurfaceCustom {
  reduced: boolean;
  fly(): Fly | null;
}

/** The settings choice, as MotionConfig names it. */
export const REDUCED_MOTION: Record<
  Settings["reducedMotion"],
  NonNullable<MotionConfigProps["reducedMotion"]>
> = { system: "user", on: "always", off: "never" };

// Seconds.
export const ENTER_S = 0.12;
export const EXIT_S = 0.1;
export const MINIMIZE_S = 0.2;
export const FADE_S = 0.15;

/** A client-px rect in screen units. Position needs the box offset, size only the scale. */
export function toScreenRect(
  rect: IconRect,
  screen: Pick<ScreenValue, "scale" | "toScreenPoint">,
): ScreenRect {
  const { x, y } = screen.toScreenPoint(rect.left, rect.top);
  return {
    x,
    y,
    width: rect.width / screen.scale,
    height: rect.height / screen.scale,
  };
}

/**
 * Moves the centre of `box` onto the centre of `icon` and shrinks it to fit
 * inside. motion scales about the centre, so the two compose.
 */
export function flyTo(box: ScreenRect, icon: ScreenRect): Fly {
  return {
    x: icon.x + icon.width / 2 - (box.x + box.width / 2),
    y: icon.y + icon.height / 2 - (box.y + box.height / 2),
    scale: Math.min(icon.width / box.width, icon.height / box.height),
  };
}

/**
 * Enter and exit are fades with a small scale. Minimise flies to the icon, or
 * fades in place when there is none or motion is reduced. Restore is `shown`.
 */
export const surfaceVariants = {
  enter: (c: SurfaceCustom) =>
    c.reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 },
  shown: {
    opacity: 1,
    scale: 1,
    x: 0,
    y: 0,
    transition: { duration: ENTER_S, ease: "easeOut" },
  },
  minimized: (c: SurfaceCustom) => {
    const fly = c.reduced ? null : c.fly();
    return fly
      ? {
          opacity: 0,
          x: fly.x,
          y: fly.y,
          scale: fly.scale,
          transition: { duration: MINIMIZE_S, ease: "easeIn" },
        }
      : { opacity: 0, transition: { duration: FADE_S } };
  },
  exit: { opacity: 0, transition: { duration: EXIT_S } },
} satisfies Variants;
