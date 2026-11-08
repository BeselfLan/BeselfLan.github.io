import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOT_STAGES, bootMachine, createStageMachine } from "@/os/boot/stages";
import { os, useOS } from "@/os/store";
import { LOCK_NOTICE, lockOutcome, power, SETTINGS_NOTICE } from "./power";

// The real table plus a stage that a "lock" event enters, as stages.test.ts
// builds it. #14 adds an entry like this one.
const lockMachine = createStageMachine({
  ...BOOT_STAGES,
  locked: {
    duration: { full: null, fast: null, skip: null },
    onEnter: () => {},
    next: "desktop",
    enteredBy: { lock: ["desktop"] },
  },
});

const stateWith = (showLogin: boolean, stage = "desktop") => ({
  boot: { stage },
  settings: { showLogin },
});

const items = () => useOS.getState().notifications.items;

beforeEach(() => {
  useOS.setState(useOS.getInitialState(), true);
  useOS.setState((s) => {
    s.boot.stage = "desktop";
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Lock follows the stage table", () => {
  it("locks when the login is on and the table has a lock event", () => {
    expect(lockOutcome(stateWith(true), lockMachine)).toBe("lock");
  });

  it("notifies when the login is off, even with a lock event", () => {
    expect(lockOutcome(stateWith(false), lockMachine)).toBe("notify");
  });

  it("notifies on v2's real table, which has no lock event", () => {
    expect(lockOutcome(stateWith(true), bootMachine)).toBe("notify");
  });

  it("notifies from a stage the lock event does not leave", () => {
    expect(lockOutcome(stateWith(true, "boot-log"), lockMachine)).toBe(
      "notify",
    );
  });

  it("sends the lock event, and pushes nothing, when it can lock", () => {
    useOS.setState((s) => {
      s.settings.showLogin = true;
    });
    const send = vi.spyOn(os.boot, "send");
    power.lock(lockMachine);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("lock");
    expect(items()).toHaveLength(0);
  });

  it("does not send the lock event when it cannot lock", () => {
    useOS.setState((s) => {
      s.settings.showLogin = false;
    });
    const send = vi.spyOn(os.boot, "send");
    power.lock(lockMachine);
    expect(send).not.toHaveBeenCalled();
    expect(items()).toHaveLength(1);
  });
});

describe("the actions", () => {
  it("Settings says it is coming", () => {
    power.settings();
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({
      title: "Settings",
      body: "The Settings app is coming soon.",
    });
    expect(SETTINGS_NOTICE).toEqual({
      title: "Settings",
      body: "The Settings app is coming soon.",
    });
    expect(useOS.getState().boot.stage).toBe("desktop");
  });

  it("Lock says it is unavailable when it cannot lock", () => {
    useOS.setState((s) => {
      s.settings.showLogin = false;
    });
    power.lock();
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({
      title: "Lock",
      body: "Locking is not available.",
    });
    expect(LOCK_NOTICE).toEqual({
      title: "Lock",
      body: "Locking is not available.",
    });
    expect(useOS.getState().boot.stage).toBe("desktop");
  });

  it("Lock says so on the real table even with the login on", () => {
    useOS.setState((s) => {
      s.settings.showLogin = true;
    });
    power.lock();
    expect(items().map((n) => n.title)).toEqual(["Lock"]);
    expect(useOS.getState().boot.stage).toBe("desktop");
  });

  it("Restart is a full boot", () => {
    useOS.setState((s) => {
      s.boot.mode = "fast";
    });
    power.restart();
    expect(useOS.getState().boot.stage).toBe("restarting");
    expect(useOS.getState().boot.mode).toBe("full");
  });

  it("Power Off shuts down", () => {
    power.powerOff();
    expect(useOS.getState().boot.stage).toBe("shutting-down");
  });
});
