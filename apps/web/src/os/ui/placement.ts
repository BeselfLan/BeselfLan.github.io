"use client";

import { useLayoutEffect, type RefObject } from "react";
import { useScreen } from "../screen/Screen";
import type { Point } from "../store/windows";

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}
export type Side = "top" | "right" | "bottom" | "left";
export type Align = "start" | "center";
export interface PlacementOptions {
  side?: Side;
  align?: Align;
  /** In screen units. */
  gap?: number;
}

/**
 * Where a box of `size` goes beside `anchor`, all in screen units. It is
 * clamped inside `bounds`, upper bound first: a box larger than the bounds
 * ends at the top left, as `placement()` in the window store does.
 */
export function place(
  anchor: AnchorRect,
  size: Size,
  bounds: Size,
  side: Side,
  align: Align,
  gap: number,
): Point {
  const across = (start: number, length: number, own: number) =>
    align === "center" ? start + length / 2 - own / 2 : start;

  let x: number;
  let y: number;
  if (side === "top" || side === "bottom") {
    x = across(anchor.left, anchor.width, size.width);
    y =
      side === "bottom"
        ? anchor.top + anchor.height + gap
        : anchor.top - size.height - gap;
  } else {
    y = across(anchor.top, anchor.height, size.height);
    x =
      side === "right"
        ? anchor.left + anchor.width + gap
        : anchor.left - size.width - gap;
  }
  return {
    x: Math.max(0, Math.min(x, bounds.width - size.width)),
    y: Math.max(0, Math.min(y, bounds.height - size.height)),
  };
}

/**
 * Places `ref` beside an anchor given in client px, then reveals it. The
 * element must start `visibility: hidden` and be `absolute` inside the portal
 * target. It runs after every render, so a change of content places it again.
 */
export function usePlacement(
  ref: RefObject<HTMLElement | null>,
  anchor: AnchorRect,
  { side = "bottom", align = "start", gap = 4 }: PlacementOptions = {},
): void {
  const { scale, toScreenPoint, portalTarget } = useScreen();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !portalTarget) return;
    // offsetWidth and offsetHeight ignore transforms, so inside the scaled
    // box they are already screen units. The anchor's size is client px.
    const origin = toScreenPoint(anchor.left, anchor.top);
    const to = place(
      {
        left: origin.x,
        top: origin.y,
        width: anchor.width / scale,
        height: anchor.height / scale,
      },
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: portalTarget.offsetWidth, height: portalTarget.offsetHeight },
      side,
      align,
      gap,
    );
    el.style.left = `${to.x}px`;
    el.style.top = `${to.y}px`;
    el.style.visibility = "visible";
  });
}
