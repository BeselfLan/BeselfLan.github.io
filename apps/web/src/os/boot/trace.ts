// User Timing marks for the boot (#124). BootSequence's stage clock marks
// each stage at the moment it starts that stage's timer, with the duration
// it scheduled, so a test or the DevTools Performance panel can read a boot
// on the app's own clock rather than the host's frame rate. The marks ship
// in every build, because #27 plans to run e2e against the static export.
// Override: gate markBootStage behind a flag that CI sets.
import type { BootMode, BootStage } from "./stages";

/** A boot mark is named BOOT_MARK + its stage: "beselfos:boot:firmware". */
export const BOOT_MARK = "beselfos:boot:";

export interface BootMarkDetail {
  stage: BootStage;
  mode: BootMode;
  /** The ms the stage clock scheduled. null: the stage sets no timer. */
  ms: number | null;
}

/** Never throws: a trace must not stop the boot. */
export function markBootStage(detail: BootMarkDetail): void {
  try {
    performance.mark(BOOT_MARK + detail.stage, { detail });
  } catch {
    // No User Timing here: nothing to record.
  }
}
