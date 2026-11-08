import { describe, expect, it } from "vitest";
import {
  BOOT_STAGES,
  bootMachine,
  createStageMachine,
  type BootMode,
  type BootStage,
  type StageContext,
  type StageDef,
} from "./stages";

const ctx = (
  mode: BootMode,
  over: Partial<StageContext> = {},
): StageContext => ({ mode, showLogin: false, bootLogMs: 2400, ...over });

interface Machine<K extends string> {
  durationFor(stage: K, c: StageContext): number | null;
  nextStage(stage: K, c: StageContext): K | null;
}

function walk<K extends string>(
  machine: Machine<K>,
  start: K,
  c: StageContext,
): { path: K[]; total: number } {
  const path: K[] = [start];
  let total = 0;
  let cur: K | null = start;
  while (cur !== null) {
    total += machine.durationFor(cur, c) ?? 0;
    cur = machine.nextStage(cur, c);
    if (cur !== null) path.push(cur);
  }
  return { path, total };
}

const BOOT_PATH = [
  "lid-opening",
  "power-on",
  "firmware",
  "boot-log",
  "desktop-enter",
  "desktop",
];

describe("table structure", () => {
  const defs: StageDef[] = Object.values(BOOT_STAGES);
  const keys = new Set(Object.keys(BOOT_STAGES));

  it("every next and enteredBy source names a real stage", () => {
    for (const d of defs) {
      if (d.next !== null) expect(keys.has(d.next)).toBe(true);
      for (const from of Object.values(d.enteredBy ?? {}).flat()) {
        expect(keys.has(from)).toBe(true);
      }
    }
  });

  it("every entry has all modes and an onEnter function", () => {
    for (const d of defs) {
      expect(Object.keys(d.duration).sort()).toEqual(["fast", "full", "skip"]);
      expect(typeof d.onEnter).toBe("function");
    }
  });
});

describe("durations", () => {
  it.each([
    ["lid-opening", 1000],
    ["power-on", 300],
    ["firmware", 500],
    ["desktop-enter", 400],
    ["shutting-down", 600],
  ] as const)("%s is %i in full", (stage, ms) => {
    expect(bootMachine.durationFor(stage, ctx("full"))).toBe(ms);
  });

  it("boot-log uses bootLogMs in full", () => {
    const c = ctx("full", { bootLogMs: 1234 });
    expect(bootMachine.durationFor("boot-log", c)).toBe(1234);
  });

  it.each([
    ["lid-opening", 0],
    ["power-on", 0],
    ["firmware", 0],
    ["boot-log", 0],
    ["login", null],
    ["desktop-enter", 400],
  ] as const)("%s is %s in fast", (stage, ms) => {
    expect(bootMachine.durationFor(stage, ctx("fast"))).toBe(ms);
  });

  it.each(["full", "fast", "skip"] as const)(
    "shutting-down and restarting are 600 in %s",
    (mode) => {
      expect(bootMachine.durationFor("shutting-down", ctx(mode))).toBe(600);
      expect(bootMachine.durationFor("restarting", ctx(mode))).toBe(600);
    },
  );
});

describe("boot walks", () => {
  it.each([
    ["full", 4600],
    ["fast", 400],
    ["skip", 0],
  ] as const)("%s from lid-opening totals %i", (mode, total) => {
    const w = walk(bootMachine, "lid-opening", ctx(mode));
    expect(w.path).toEqual(BOOT_PATH);
    expect(w.total).toBe(total);
  });

  it.each([
    ["full", true],
    ["fast", true],
    ["skip", false],
  ] as const)("login with showLogin on in %s: %s", (mode, present) => {
    const { path } = walk(
      bootMachine,
      "lid-opening",
      ctx(mode, { showLogin: true }),
    );
    expect(path.includes("login")).toBe(present);
    if (present) {
      expect(path.indexOf("login")).toBe(path.indexOf("boot-log") + 1);
      expect(path.indexOf("desktop-enter")).toBe(path.indexOf("login") + 1);
    }
  });

  it.each(["full", "fast", "skip"] as const)(
    "login is absent with showLogin off in %s",
    (mode) => {
      const { path } = walk(bootMachine, "lid-opening", ctx(mode));
      expect(path).not.toContain("login");
    },
  );
});

describe("events", () => {
  it("power off goes desktop to shutting-down to off", () => {
    expect(bootMachine.stageForEvent("shutdown", "desktop")).toBe(
      "shutting-down",
    );
    const { path } = walk(bootMachine, "shutting-down", ctx("full"));
    expect(path.at(-1)).toBe("off");
    expect(bootMachine.stageForEvent("powerOn", "off")).toBe("lid-opening");
  });

  it("restart keeps the lid open", () => {
    expect(bootMachine.stageForEvent("restart", "desktop")).toBe("restarting");
    const { path, total } = walk(bootMachine, "restarting", ctx("full"));
    expect(path.at(-1)).toBe("desktop");
    expect(path).not.toContain("lid-opening");
    expect(total).toBe(4200);
  });

  it("skip jumps from firmware and boot-log to desktop-enter", () => {
    expect(bootMachine.stageForEvent("skip", "firmware")).toBe("desktop-enter");
    expect(bootMachine.stageForEvent("skip", "boot-log")).toBe("desktop-enter");
  });

  it("invalid events return null", () => {
    expect(bootMachine.stageForEvent("skip", "power-on")).toBeNull();
    expect(bootMachine.stageForEvent("shutdown", "firmware")).toBeNull();
  });

  it("skip and restart are valid only from their listed stages", () => {
    for (const stage of Object.keys(BOOT_STAGES) as BootStage[]) {
      const canSkip = stage === "firmware" || stage === "boot-log";
      expect(bootMachine.stageForEvent("skip", stage) !== null).toBe(canSkip);
      expect(bootMachine.stageForEvent("restart", stage) !== null).toBe(
        stage === "desktop",
      );
    }
  });
});

describe("one entry adds a stage", () => {
  // stageForEvent enters the first entry, in table order, that lists the
  // event from the current stage, so the added entry uses an event the real
  // table does not have.
  const machine = createStageMachine({
    ...BOOT_STAGES,
    screensaver: {
      duration: { full: null, fast: null, skip: null },
      onEnter: () => {},
      next: "desktop",
      enteredBy: { idle: ["desktop"] },
    },
  });

  it("is reachable and walkable without touching other entries", () => {
    expect(bootMachine.stageForEvent("idle", "desktop")).toBeNull();
    expect(machine.stageForEvent("idle", "desktop")).toBe("screensaver");
    expect(machine.nextStage("screensaver", ctx("full"))).toBe("desktop");
    expect("screensaver" in BOOT_STAGES).toBe(false);
  });
});
