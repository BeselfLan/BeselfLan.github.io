// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CAROUSEL,
  depthStyle,
  dragToRotation,
  frontIndex,
  itemPose,
  release,
  releaseOmega,
  REST,
  ringRadius,
  ringTheta,
  ringTransform,
  rotationForIndex,
  snapRotation,
  springTo,
  stepMotion,
  stepTarget,
  wheelToRotation,
  type Motion,
} from "./carousel.math";
import { contrastRatio, over } from "./wcag";

// θ for the 13 featured entries.
const θ = 360 / 13;

/** Steps at 1/60 s until idle. Stops at 600 so a broken model fails, not hangs. */
function runToIdle(start: Motion, n: number) {
  let m = start;
  let steps = 0;
  while (m.mode !== "idle" && steps < 600) {
    m = stepMotion(m, 1 / 60, n);
    steps++;
  }
  return { m, steps };
}

describe("the ring", () => {
  it("has an angle per item", () => {
    expect(ringTheta(1)).toBe(360);
    expect(ringTheta(2)).toBe(180);
    expect(ringTheta(13)).toBeCloseTo(27.6923, 4);
    expect(ringTheta(0)).toBe(0);
  });

  it("has a radius that never drops below the floor", () => {
    // C.1's formula alone gives about 7e17 at n=1 and 103.9 at n=3.
    for (const n of [1, 2, 3]) expect(ringRadius(n)).toBe(300);
    expect(ringRadius(13)).toBeCloseTo(376.07, 2);
    // Not stuck at the floor.
    expect(ringRadius(23)).toBeCloseTo(660.95, 2);
  });
});

describe("depth styling", () => {
  it("scales, fades and stacks by depth", () => {
    expect(depthStyle(1)).toEqual({ scale: 1, opacity: 1, zIndex: 200 });
    const mid = depthStyle(0);
    expect(mid.scale).toBeCloseTo(0.85, 10);
    // The floor is 0.5, not C.1's 0.35: see depthStyle (#147).
    expect(mid.opacity).toBeCloseTo(0.75, 10);
    expect(mid.zIndex).toBe(100);
    const back = depthStyle(-1);
    expect(back.scale).toBeCloseTo(0.7, 10);
    expect(back.opacity).toBeCloseTo(0.5, 10);
    expect(back.zIndex).toBe(0);
  });

  it("the back label clears 4.5:1", () => {
    // `#f7f7f7` is --os-panel-fg and `#1e1e1e` the window's bg-os-panel: a
    // back item's label is the one over the window, at the item's opacity.
    const panel = "#1e1e1e";
    const label = (opacity: number) =>
      contrastRatio(over("#f7f7f7", opacity, panel), panel);
    expect(label(depthStyle(-1).opacity)).toBeGreaterThanOrEqual(4.5);
    // C.1's old floor is below the bar, so this test can fail.
    expect(label(0.35)).toBeLessThan(4.5);
  });

  it("over composites per channel", () => {
    expect(over("#ffffff", 0.5, "#000000")).toBe("#808080");
    expect(over("#336699", 1, "#ffffff")).toBe("#336699");
    expect(over("#336699", 0, "#ffffff")).toBe("#ffffff");
    expect(() => over("#fff", 0.5, "#000000")).toThrow();
    expect(() => over("#ffffff", 0.5, "black")).toThrow();
  });

  it("reads the depth of an item from its turned angle", () => {
    expect(itemPose(1, 4, 0).depth).toBeCloseTo(0, 10);
    expect(itemPose(1, 2, 0).depth).toBeCloseTo(-1, 10);
    // Leaving `rot` out of the angle gives scale 1 and fails.
    const front = itemPose(0, 13, -θ);
    expect(front.scale).toBeCloseTo(0.9828, 4);
    expect(front.zIndex).toBe(189);
  });

  it("puts the item at the front in front", () => {
    const pose = itemPose(5, 13, -5 * θ);
    expect(pose.depth).toBeCloseTo(1, 10);
    expect(pose.scale).toBeCloseTo(1, 10);
    expect(pose.zIndex).toBe(200);
  });
});

describe("billboarding", () => {
  it("turns an item back by its angle with the ring's turn included", () => {
    expect(itemPose(3, 13, -10).transform).toBe(
      "rotateY(83.077deg) translateZ(376.072px) rotateY(-73.077deg) scale(0.894)",
    );
  });

  it("pushes the ring back by its radius", () => {
    expect(ringTransform(-10, 13)).toBe(
      "translateZ(-376.072px) rotateY(-10deg)",
    );
    // #83's test reads this exact string.
    expect(ringTransform(0, 13)).toBe("translateZ(-376.072px) rotateY(0deg)");
  });

  it("prints no negative zero", () => {
    expect(itemPose(0, 13, 0).transform).toContain("rotateY(0deg)");
    expect(itemPose(0, 13, 0).transform).not.toContain("-0");
    expect(ringTransform(-0, 13)).toBe("translateZ(-376.072px) rotateY(0deg)");
  });

  it("holds no translate that the ring's rotation would turn", () => {
    expect(itemPose(2, 13, 0).transform).not.toMatch(/translate\(|translateX/);
  });
});

describe("the nearest item", () => {
  it("is the front index, wrapped", () => {
    expect(frontIndex(-2.4 * θ, 13)).toBe(2);
    expect(frontIndex(-2.6 * θ, 13)).toBe(3);
    expect(frontIndex(-0.49 * θ, 13)).toBe(0);
    // A plain % gives -1 here.
    expect(frontIndex(θ, 13)).toBe(12);
    expect(frontIndex(-14 * θ, 13)).toBe(1);
    expect(frontIndex(0, 0)).toBe(-1);
  });

  it("snaps the rotation to a whole item", () => {
    expect(snapRotation(-2.6 * θ, 13)).toBeCloseTo(-3 * θ, 10);
    expect(snapRotation(370, 13)).toBeCloseTo(360, 10);
    expect(snapRotation(33, 0)).toBe(33);
  });
});

describe("the shortest path", () => {
  it("goes the near way round and keeps the turn count", () => {
    expect(rotationForIndex(12, 0, 13)).toBeCloseTo(θ, 10);
    expect(rotationForIndex(2, -360 - θ, 13)).toBeCloseTo(-360 - 2 * θ, 10);
    expect(rotationForIndex(0, 350, 13)).toBeCloseTo(360, 10);
    expect(rotationForIndex(4, 17, 0)).toBe(17);
  });

  it("lands on the index it was asked for", () => {
    for (const index of [0, 5, 12]) {
      for (const rot of [-700, -30, 0, 45, 400]) {
        expect(frontIndex(rotationForIndex(index, rot, 13), 13)).toBe(index);
      }
    }
  });
});

describe("arrow steps", () => {
  it("move one item from rest", () => {
    expect(stepTarget(REST, 1, 13)).toBeCloseTo(-θ, 10);
    expect(stepTarget(REST, -1, 13)).toBeCloseTo(θ, 10);
  });

  it("start from the spring's target, so quick presses add up", () => {
    const m: Motion = { rot: -5, omega: -100, mode: "spring", target: -θ };
    expect(stepTarget(m, 1, 13)).toBeCloseTo(-2 * θ, 10);
  });

  it("start from the nearest item when no spring runs", () => {
    const coasting: Motion = {
      rot: -40,
      omega: -300,
      mode: "inertia",
      target: 0,
    };
    expect(stepTarget(coasting, 1, 13)).toBeCloseTo(-2 * θ, 10);
  });

  it("stay put for an empty ring", () => {
    expect(stepTarget({ ...REST, rot: 12 }, 1, 0)).toBe(12);
  });
});

describe("the wheel", () => {
  it("turns by the larger axis, scaled by the delta mode", () => {
    expect(
      wheelToRotation({ deltaX: 0, deltaY: 100, deltaMode: 0 }),
    ).toBeCloseTo(-15, 10);
    expect(
      wheelToRotation({ deltaX: -60, deltaY: 10, deltaMode: 0 }),
    ).toBeCloseTo(9, 10);
    // A line is 40 px and a page is 800 px.
    expect(wheelToRotation({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBeCloseTo(
      -18,
      10,
    );
    expect(wheelToRotation({ deltaX: 0, deltaY: 1, deltaMode: 2 })).toBeCloseTo(
      -120,
      10,
    );
  });
});

describe("the drag", () => {
  it("follows the pointer and divides by the scale", () => {
    // Without the division by the scale the first gives -30, and C.1's sign
    // gives +60.
    expect(dragToRotation(-100, 0.5)).toBeCloseTo(-60, 10);
    expect(dragToRotation(50, 1)).toBeCloseTo(15, 10);
  });

  it("treats a scale that is not positive as 1", () => {
    expect(dragToRotation(10, 0)).toBeCloseTo(3, 10);
    expect(dragToRotation(10, -2)).toBeCloseTo(3, 10);
    expect(dragToRotation(10, Number.NaN)).toBeCloseTo(3, 10);
  });

  it("brings the next item to the front when dragged left", () => {
    // Drag far enough left to turn by one item, then snap.
    const rot = dragToRotation(-(θ / CAROUSEL.dragDegPerUnit), 1);
    expect(frontIndex(rot, 13)).toBe(1);
  });
});

describe("the release velocity", () => {
  it("comes from the last 80 ms", () => {
    const samples = [0, 16, 32, 48, 64, 80].map((t, i) => ({
      t,
      rot: -10 * i,
    }));
    expect(releaseOmega(samples, 80)).toBeCloseTo(-625, 10);
    // The pointer was held still since.
    expect(releaseOmega(samples, 180)).toBe(0);
  });

  it("ignores samples older than the window", () => {
    const samples = [
      { t: 0, rot: 0 },
      { t: 50, rot: -100 },
      { t: 100, rot: -110 },
      { t: 116, rot: -120 },
    ];
    // Using every sample would give about -1034.
    expect(releaseOmega(samples, 116)).toBeCloseTo(-303.03, 2);
  });

  it("is 0 with one sample, none, or no time between them", () => {
    expect(releaseOmega([{ t: 5, rot: 3 }], 5)).toBe(0);
    expect(releaseOmega([], 5)).toBe(0);
    expect(
      releaseOmega(
        [
          { t: 5, rot: 3 },
          { t: 5, rot: 9 },
        ],
        5,
      ),
    ).toBe(0);
  });
});

describe("inertia, then the snap", () => {
  it("coasts about 210 degrees from 600 deg/s and ends on a whole item", () => {
    const start = release(REST, -600, 13, false);
    expect(start.mode).toBe("inertia");
    const { m, steps } = runToIdle(start, 13);
    expect(m.mode).toBe("idle");
    expect(steps).toBeLessThanOrEqual(120);
    expect(Math.abs(m.rot / θ - Math.round(m.rot / θ))).toBeLessThan(1e-9);
    // A tau of 1 s would travel about -600.
    expect(m.rot).toBeGreaterThan(-210 - θ);
    expect(m.rot).toBeLessThan(-210 + θ);
    expect(m.target).toBe(m.rot);
    expect(m.omega).toBe(0);
  });

  it("clamps a hard flick", () => {
    expect(release(REST, -5000, 13, false).omega).toBe(-1080);
    expect(release(REST, 5000, 13, false).omega).toBe(1080);
    expect(release(REST, Number.NaN, 13, false).omega).toBe(0);
  });

  it("springs at once from a slow release", () => {
    const m = release({ ...REST, rot: -30 }, 10, 13, false);
    expect(m.mode).toBe("spring");
    expect(m.target).toBeCloseTo(-θ, 10);
    expect(m.omega).toBe(10);
  });

  it("slows down and never speeds up", () => {
    let m = release(REST, -600, 13, false);
    let last = Math.abs(m.omega);
    for (let i = 0; i < 40 && m.mode === "inertia"; i++) {
      m = stepMotion(m, 1 / 60, 13);
      expect(Math.abs(m.omega)).toBeLessThanOrEqual(last);
      last = Math.abs(m.omega);
    }
  });
});

describe("the spring", () => {
  it("settles on the target without crossing it", () => {
    let m: Motion = { rot: 10, omega: 0, mode: "spring", target: 0 };
    let lowest = m.rot;
    let steps = 0;
    while (m.mode !== "idle" && steps < 600) {
      m = stepMotion(m, 1 / 60, 13);
      lowest = Math.min(lowest, m.rot);
      steps++;
    }
    expect(lowest).toBeGreaterThanOrEqual(-0.5);
    expect(steps).toBeLessThanOrEqual(60);
    expect(m).toEqual({ rot: 0, omega: 0, mode: "idle", target: 0 });
  });

  it("is stable at the capped step", () => {
    let m: Motion = { rot: 40, omega: 0, mode: "spring", target: 0 };
    let steps = 0;
    while (m.mode !== "idle" && steps < 600) {
      m = stepMotion(m, 1 / 30, 13);
      steps++;
    }
    expect(m.mode).toBe("idle");
    expect(m.rot).toBe(0);
  });

  it("keeps its speed when retargeted", () => {
    const m = springTo(
      { rot: 5, omega: 77, mode: "inertia", target: 0 },
      9,
      false,
    );
    expect(m).toEqual({ rot: 5, omega: 77, mode: "spring", target: 9 });
  });
});

describe("reduced motion", () => {
  it("jumps to the nearest item on release", () => {
    expect(release({ ...REST, rot: -40 }, 500, 13, true)).toEqual({
      rot: -θ,
      omega: 0,
      mode: "idle",
      target: -θ,
    });
  });

  it("jumps to the target", () => {
    expect(springTo(REST, -2 * θ, true)).toEqual({
      rot: -2 * θ,
      omega: 0,
      mode: "idle",
      target: -2 * θ,
    });
  });
});

describe("stepMotion", () => {
  it("caps dt at 1/30 s", () => {
    const m: Motion = { rot: 10, omega: 0, mode: "spring", target: 0 };
    expect(stepMotion(m, 1, 13)).toEqual(stepMotion(m, 1 / 30, 13));
  });

  it("ignores a negative or non-numeric dt", () => {
    const m: Motion = { rot: 10, omega: 0, mode: "spring", target: 0 };
    expect(stepMotion(m, -1, 13)).toEqual(stepMotion(m, 0, 13));
    expect(stepMotion(m, Number.NaN, 13)).toEqual(stepMotion(m, 0, 13));
  });

  it("returns idle and drag states as they are", () => {
    expect(stepMotion(REST, 1 / 60, 13)).toBe(REST);
    const dragging: Motion = { rot: 3, omega: 0, mode: "drag", target: 0 };
    expect(stepMotion(dragging, 1 / 60, 13)).toBe(dragging);
  });

  it("does not change the state it is given", () => {
    const m: Motion = Object.freeze({
      rot: 10,
      omega: 0,
      mode: "spring",
      target: 0,
    });
    expect(() => stepMotion(m, 1 / 60, 13)).not.toThrow();
    expect(m.rot).toBe(10);
  });
});

describe("the module", () => {
  const text = readFileSync(
    fileURLToPath(new URL("./carousel.math.ts", import.meta.url)),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

  it("is pure: no import, no DOM, no clock, no randomness", () => {
    expect(text).not.toMatch(/\bimport\b/);
    expect(text).not.toMatch(
      /\b(window|document|requestAnimationFrame|performance|setTimeout)\b|\bDate\b|Math\.random/,
    );
  });
});
