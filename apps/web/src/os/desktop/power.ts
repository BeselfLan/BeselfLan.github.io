import { bootMachine } from "../boot/stages";
import { os, useOS } from "../store";

// Section 6 of the plan words these. They land in the calendar's list, which
// reads the same store as the toasts.
export const SETTINGS_NOTICE = {
  title: "Settings",
  body: "The Settings app is coming soon.",
} as const;
export const LOCK_NOTICE = {
  title: "Lock",
  body: "Locking is not available.",
} as const;

// The least `lockOutcome` needs, so the real store state, a test literal and
// any `createStageMachine(...)` result all fit. A method signature makes the
// machine's narrower stage type assignable here.
export interface LockInputs {
  boot: { stage: string };
  settings: { showLogin: boolean };
}
export interface EventLookup {
  stageForEvent(event: string, current: string): string | null;
}

/**
 * "lock" when the login screen is on and the stage table lets a "lock" event
 * leave the current stage; otherwise Lock can only say it is unavailable. The
 * table has no such event on v2. When #14 adds `enteredBy: { lock: ["desktop"] }`
 * to its login entry, this starts sending with no change here.
 */
export function lockOutcome(
  state: LockInputs,
  machine: EventLookup,
): "lock" | "notify" {
  return state.settings.showLogin &&
    machine.stageForEvent("lock", state.boot.stage) !== null
    ? "lock"
    : "notify";
}

/**
 * What the System menu items do. Restart and Power Off use the named boot
 * actions, never `send("restart")`: the named restart sets the full mode.
 */
export const power = {
  settings(): void {
    os.notifications.push({ ...SETTINGS_NOTICE });
  },
  /** `machine` is a parameter so a test can pass a table that has a lock stage. */
  lock(machine: EventLookup = bootMachine): void {
    if (lockOutcome(useOS.getState(), machine) === "lock") {
      os.boot.send("lock");
    } else {
      os.notifications.push({ ...LOCK_NOTICE });
    }
  },
  restart(): void {
    os.boot.restart();
  },
  powerOff(): void {
    os.boot.shutdown();
  },
};
