// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  FADE_MS,
  FOOTER_HEIGHT,
  HOVER_SCALE,
  PANEL_MS,
  PANEL_WIDTH,
  panelProgress,
  stageRect,
  TOOLBAR_HEIGHT,
  wallRect,
} from "./layout";

describe("the constants", () => {
  it("are the numbers of plan 6.4 to 6.6", () => {
    expect(TOOLBAR_HEIGHT).toBe(48);
    expect(FOOTER_HEIGHT).toBe(40);
    expect(PANEL_WIDTH).toBe(340);
    expect(PANEL_MS).toBe(250);
    expect(FADE_MS).toBe(150);
    expect(HOVER_SCALE).toBe(1.08);
  });
});

describe("stageRect", () => {
  it("is the content area less the toolbar and the footer", () => {
    expect(stageRect({ width: 1000, height: 580 })).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 492,
    });
    expect(stageRect({ width: 640, height: 400 })).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 400 - 48 - 40,
    });
  });

  it("never gives a negative size", () => {
    expect(stageRect({ width: 1000, height: 50 }).height).toBe(0);
    expect(stageRect({ width: 1000, height: 88 }).height).toBe(0);
    expect(stageRect({ width: -5, height: 580 }).width).toBe(0);
    expect(stageRect({ width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe("wallRect", () => {
  const stage = stageRect({ width: 1000, height: 580 });

  it("loses the panel's share of the width as it slides in", () => {
    expect(wallRect(stage, 0).width).toBe(1000);
    expect(wallRect(stage, 1).width).toBe(660);
    expect(wallRect(stage, 0.5).width).toBe(830);
  });

  it("changes only the width", () => {
    for (const p of [0, 0.25, 0.5, 1]) {
      const wall = wallRect(stage, p);
      expect(wall.x).toBe(0);
      expect(wall.y).toBe(0);
      expect(wall.height).toBe(492);
    }
  });

  it("clamps the progress to 0 and 1", () => {
    expect(wallRect(stage, 2).width).toBe(660);
    expect(wallRect(stage, -1).width).toBe(1000);
  });

  it("never gives a negative width", () => {
    const narrow = { x: 0, y: 0, width: 300, height: 100 };
    expect(wallRect(narrow, 1).width).toBe(0);
  });

  it("leaves the stage it was given alone", () => {
    const given = { x: 10, y: 20, width: 1000, height: 492 };
    const copy = { ...given };
    const wall = wallRect(given, 1);
    expect(given).toEqual(copy);
    expect(wall).not.toBe(given);
    expect(wall).toEqual({ x: 10, y: 20, width: 660, height: 492 });
  });
});

describe("panelProgress", () => {
  it("is an ease-out cubic over 250 ms", () => {
    expect(panelProgress(0)).toBe(0);
    expect(panelProgress(125)).toBeCloseTo(0.875, 10);
    expect(panelProgress(250)).toBe(1);
    expect(panelProgress(400)).toBe(1);
  });

  it("starts fast and ends slow", () => {
    // The first 10 percent of the time covers more than 10 percent of the way.
    expect(panelProgress(25)).toBeCloseTo(1 - 0.9 ** 3, 10);
    expect(panelProgress(25)).toBeGreaterThan(0.1);
    const steps = [0, 50, 100, 150, 200, 250].map(panelProgress);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    }
    expect(steps[1] - steps[0]).toBeGreaterThan(steps[5] - steps[4]);
  });

  it("is 0 before the start and for NaN", () => {
    expect(panelProgress(-10)).toBe(0);
    expect(panelProgress(NaN)).toBe(0);
  });
});
