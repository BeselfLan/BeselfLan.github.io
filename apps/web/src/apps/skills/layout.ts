// The stage and panel geometry of the Skills app (plan 6.5, 6.6). All lengths
// are screen units and all times milliseconds. Pure numbers: no React, no DOM.
//
// #90 slides the panel in: stageLoop.ts sets the physics world's walls to
// `wallRect(stage, p)` on every frame of the slide, with
// `p = panelProgress(elapsed)` opening and `1 - p` closing, so the icons are
// pushed along by the wall.

import type { Rect } from "./physics/body";

/** The tab strip above the stage (plan 6.6). */
export const TOOLBAR_HEIGHT = 48;
/** The practices row below the stage (plan 6.6, D23). */
export const FOOTER_HEIGHT = 40;
/** The width of the detail panel (plan 6.5). */
export const PANEL_WIDTH = 340;
/** How long the panel takes to slide (plan 6.5). */
export const PANEL_MS = 250;
/** The cross-fade when the tab changes (plan 6.6). */
export const FADE_MS = 150;
/** How much an icon grows under the pointer (plan 6.4). */
export const HOVER_SCALE = 1.08;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * The stage inside the window's content area: that area minus the toolbar and
 * the footer. `api.bounds()` is 1000 x 580 today, so the stage is 1000 x 492.
 * The size never goes negative.
 */
export function stageRect(content: { width: number; height: number }): Rect {
  return {
    x: 0,
    y: 0,
    width: Math.max(0, content.width),
    height: Math.max(0, content.height - TOOLBAR_HEIGHT - FOOTER_HEIGHT),
  };
}

/**
 * The wall of the world while the panel slides: the stage with the panel's
 * share cut off its right side. `progress` is 0 (no panel) to 1 (the panel
 * fully in) and is clamped to that, a `NaN` counts as 0, and the width never
 * goes negative. Only the width changes.
 */
export function wallRect(stage: Rect, progress: number): Rect {
  return {
    ...stage,
    width: Math.max(
      0,
      stage.width -
        PANEL_WIDTH * clamp(Number.isNaN(progress) ? 0 : progress, 0, 1),
    ),
  };
}

const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;

/**
 * How far the panel has slid after `elapsedMs`, 0 to 1: an ease-out cubic over
 * `PANEL_MS`, so the icons are pushed hardest at the start. A time before the
 * start or a `NaN` gives 0, and a time after the end gives 1.
 */
export function panelProgress(elapsedMs: number): number {
  if (Number.isNaN(elapsedMs)) return 0;
  return easeOutCubic(clamp(elapsedMs / PANEL_MS, 0, 1));
}
