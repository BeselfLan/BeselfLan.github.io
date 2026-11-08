// Where the laptop's lid and camera are at each boot stage (plan 3.1, #75).
// Pure data and one function: no React, no DOM, no clock, so a test can read
// every pose and the server can render the first one.
//
// #14 (plan 3.5): the closed pose now carries a transition, so the move from
// `shutting-down` into `off` folds the lid down while the camera pulls back to
// the wide shot. `initial={false}` means the first `off` (the server HTML and
// the first paint) never animates, only that move does. Reduced motion snaps
// every pose, and `isShutDown` says when the power button shows. Add a state
// to `LID_STATE`, or a pose below, and nothing else in `Laptop.tsx` changes.

import { bootMachine, type BootStage, type StageContext } from "./stages";

/** `closed` before the boot, `opening` for the lid-opening stage, `open` after. */
export type LidState = "closed" | "opening" | "open";

// Type aliases, not interfaces: motion's `animate` wants a type with an
// implicit index signature, which an interface does not have.
export type CameraPose = {
  /** Degrees; negative looks down on the deck. */
  rotateX: number;
  scale: number;
  /** Pixels. */
  y: number;
};
export type LidPose = {
  /** Degrees about the hinge; 0 is open and -90 lies flat over the deck. */
  rotateX: number;
};
export interface LaptopPose {
  state: LidState;
  camera: CameraPose;
  lid: LidPose;
  /** Seconds; the ease is only set where the pose moves. */
  transition: { duration: number; ease?: "easeOut" | "easeInOut" };
}

// Keyed by BootStage, so a stage added to the table fails `tsc` until it has a
// state here, as `VIEWS` in BootScreens.tsx does. A restart keeps the lid open
// (contract 4.3).
const LID_STATE: Record<BootStage, LidState> = {
  off: "closed",
  "lid-opening": "opening",
  "power-on": "open",
  firmware: "open",
  "boot-log": "open",
  login: "open",
  "desktop-enter": "open",
  desktop: "open",
  "shutting-down": "open",
  restarting: "open",
};

// The settled pose is the identity: the numbers 0 and 1, never "0%". Motion
// then writes `transform: none`, and `Screen.toScreenPoint`, which reads the
// box's rect, sees the real position.
export const OPEN_CAMERA: CameraPose = Object.freeze({
  rotateX: 0,
  scale: 1,
  y: 0,
});
export const OPEN_LID: LidPose = Object.freeze({ rotateX: 0 });

// Starting values, tuned by eye. A negative camera tilt looks down on the
// deck, and -90 lays the lid flat over it. The camera turns about its top
// edge, so the closed laptop lands near the viewport centre at any size and
// no pixel `y` is needed.
const CLOSED_CAMERA: CameraPose = Object.freeze({
  rotateX: -40,
  scale: 0.5,
  y: 0,
});
const CLOSED_LID: LidPose = Object.freeze({ rotateX: -90 });

/** The lid folds down, and the camera pulls back, over this long at Power Off. */
export const LID_CLOSE_MS = 800;

export const OPEN_POSE: LaptopPose = Object.freeze({
  state: "open",
  camera: OPEN_CAMERA,
  lid: OPEN_LID,
  transition: Object.freeze({ duration: 0 }),
});

/**
 * The pose for a stage. While opening, the target is the open pose and the
 * transition lasts the stage, read from the stage table so a fast boot (0 ms)
 * opens at once. The closed pose takes LID_CLOSE_MS to get to, which only plays
 * when the stage changes into `off`. With `reduced`, every transition is 0 s.
 */
export function laptopPose(
  stage: BootStage,
  ctx: StageContext,
  { reduced = false }: { reduced?: boolean } = {},
): LaptopPose {
  const pose = poseFor(stage, ctx);
  return reduced ? { ...pose, transition: { duration: 0 } } : pose;
}

function poseFor(stage: BootStage, ctx: StageContext): LaptopPose {
  switch (LID_STATE[stage]) {
    case "closed":
      return {
        state: "closed",
        camera: CLOSED_CAMERA,
        lid: CLOSED_LID,
        transition: { duration: LID_CLOSE_MS / 1000, ease: "easeInOut" },
      };
    case "opening":
      return {
        state: "opening",
        camera: OPEN_CAMERA,
        lid: OPEN_LID,
        transition: {
          duration: (bootMachine.durationFor("lid-opening", ctx) ?? 0) / 1000,
          ease: "easeOut",
        },
      };
    case "open":
      return OPEN_POSE;
  }
}

/**
 * True after a Power Off: the stage is `off` and a boot has run. `startedAt` is
 * null until the first boot starts and is never reset, so the server HTML and
 * the first client render, both at `off` with no boot yet, are not shut down.
 */
export function isShutDown(boot: {
  stage: string;
  startedAt: number | null;
}): boolean {
  return boot.stage === "off" && boot.startedAt !== null;
}
