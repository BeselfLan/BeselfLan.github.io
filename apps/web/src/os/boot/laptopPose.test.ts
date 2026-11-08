import { describe, expect, it } from "vitest";
import {
  isShutDown,
  LID_CLOSE_MS,
  laptopPose,
  OPEN_CAMERA,
  OPEN_LID,
  OPEN_POSE,
} from "./laptopPose";
import {
  BOOT_STAGES,
  bootMachine,
  type BootMode,
  type BootStage,
  type StageContext,
} from "./stages";

const ctx = (mode: BootMode): StageContext => ({
  mode,
  showLogin: false,
  bootLogMs: 2400,
});
const stages = Object.keys(BOOT_STAGES) as BootStage[];

describe("the lid is closed only at off and opens only in lid-opening", () => {
  it.each(stages)("%s has the right state", (stage) => {
    const expected =
      stage === "off" ? "closed" : stage === "lid-opening" ? "opening" : "open";
    expect(laptopPose(stage, ctx("full")).state).toBe(expected);
  });

  it("keeps the lid open through a restart and a shutdown", () => {
    // Contract 4.3: a restart is not a power-on. The lid closes at off.
    expect(laptopPose("restarting", ctx("full")).state).toBe("open");
    expect(laptopPose("shutting-down", ctx("full")).state).toBe("open");
  });

  it("gives the same state in every mode", () => {
    for (const stage of stages) {
      const states = (["full", "fast", "skip"] as const).map(
        (mode) => laptopPose(stage, ctx(mode)).state,
      );
      expect(new Set(states).size).toBe(1);
    }
  });
});

describe("open is the identity, closed is not", () => {
  it("is the numbers 0 and 1, never strings", () => {
    for (const value of Object.values(OPEN_CAMERA)) {
      expect(typeof value).toBe("number");
    }
    for (const value of Object.values(OPEN_LID)) {
      expect(typeof value).toBe("number");
    }
    expect(OPEN_CAMERA).toEqual({ rotateX: 0, scale: 1, y: 0 });
    expect(OPEN_LID).toEqual({ rotateX: 0 });
  });

  it("is what every stage after the opening gets", () => {
    for (const stage of stages) {
      const pose = laptopPose(stage, ctx("full"));
      if (pose.state === "closed") continue;
      expect(pose.camera).toEqual(OPEN_CAMERA);
      expect(pose.lid).toEqual(OPEN_LID);
    }
    expect(laptopPose("desktop", ctx("full"))).toBe(OPEN_POSE);
  });

  it("lays the closed lid flat or further, and moves the closed camera", () => {
    const closed = laptopPose("off", ctx("full"));
    expect(closed.lid.rotateX).toBeLessThanOrEqual(-90);
    const differs = (
      Object.keys(OPEN_CAMERA) as (keyof typeof OPEN_CAMERA)[]
    ).some((key) => closed.camera[key] !== OPEN_CAMERA[key]);
    expect(differs).toBe(true);
    // Looking down on the deck, not up at its underside.
    expect(closed.camera.rotateX).toBeLessThan(0);
    expect(closed.camera.scale).toBeLessThan(1);
  });

  it("cannot be changed by a caller", () => {
    expect(Object.isFrozen(OPEN_CAMERA)).toBe(true);
    expect(Object.isFrozen(OPEN_LID)).toBe(true);
    expect(Object.isFrozen(OPEN_POSE)).toBe(true);
  });
});

describe("the opening lasts the lid-opening stage", () => {
  it.each(["full", "fast", "skip"] as const)(
    "takes the stage's own duration in %s mode",
    (mode) => {
      const ms = bootMachine.durationFor("lid-opening", ctx(mode));
      const pose = laptopPose("lid-opening", ctx(mode));
      expect(pose.transition.duration).toBe((ms ?? 0) / 1000);
    },
  );

  it("is 1 s in a full boot and none in a fast one", () => {
    expect(laptopPose("lid-opening", ctx("full")).transition.duration).toBe(1);
    expect(laptopPose("lid-opening", ctx("fast")).transition.duration).toBe(0);
  });

  // `off` is left out of the next two: it closes the lid, tested below.
  it("eases out while opening and sets no ease elsewhere", () => {
    expect(laptopPose("lid-opening", ctx("full")).transition.ease).toBe(
      "easeOut",
    );
    for (const stage of stages) {
      if (stage === "lid-opening" || stage === "off") continue;
      expect(laptopPose(stage, ctx("full")).transition.ease).toBeUndefined();
    }
  });

  it("snaps everywhere else", () => {
    for (const stage of stages) {
      if (stage === "lid-opening" || stage === "off") continue;
      expect(laptopPose(stage, ctx("full")).transition.duration).toBe(0);
    }
    expect(laptopPose("power-on", ctx("full")).transition.duration).toBe(0);
  });
});

describe("the lid closes at off", () => {
  it("off closes over 0.8 s, eased in and out", () => {
    expect(LID_CLOSE_MS).toBe(800);
    expect(laptopPose("off", ctx("full")).transition).toEqual({
      duration: 0.8,
      ease: "easeInOut",
    });
  });

  it("closes the same way in every mode", () => {
    for (const mode of ["full", "fast", "skip"] as const) {
      expect(laptopPose("off", ctx(mode)).transition.duration).toBe(0.8);
    }
  });
});

describe("reduced motion snaps every pose", () => {
  const modes = ["full", "fast", "skip"] as const;
  it.each(stages)("%s has no transition time", (stage) => {
    for (const mode of modes) {
      const plain = laptopPose(stage, ctx(mode));
      const reduced = laptopPose(stage, ctx(mode), { reduced: true });
      expect(reduced.transition).toEqual({ duration: 0 });
      // Where it ends up does not change, only how it gets there.
      expect(reduced.state).toBe(plain.state);
      expect(reduced.camera).toEqual(plain.camera);
      expect(reduced.lid).toEqual(plain.lid);
    }
  });

  it("leaves the shared poses alone", () => {
    laptopPose("desktop", ctx("full"), { reduced: true });
    expect(OPEN_POSE.transition).toEqual({ duration: 0 });
    expect(laptopPose("off", ctx("full")).transition.duration).toBe(0.8);
    expect(laptopPose("lid-opening", ctx("full")).transition.duration).toBe(1);
  });

  it("reduced: false is the default", () => {
    expect(laptopPose("off", ctx("full"), { reduced: false })).toEqual(
      laptopPose("off", ctx("full")),
    );
  });
});

describe("isShutDown", () => {
  it("is off after a boot has started", () => {
    expect(isShutDown({ stage: "off", startedAt: null })).toBe(false);
    expect(isShutDown({ stage: "off", startedAt: 123 })).toBe(true);
    expect(isShutDown({ stage: "desktop", startedAt: 123 })).toBe(false);
    expect(isShutDown({ stage: "shutting-down", startedAt: 123 })).toBe(false);
  });
});
