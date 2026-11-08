import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOOT_STAGES,
  bootMachine,
  type BootMode,
  type BootStage,
  type StageContext,
  type StageDef,
  type StageTable,
} from "@/os/boot/stages";
import {
  bootContext,
  createBootActions,
  initialBoot,
  type BootApi,
  type BootHost,
} from "@/os/store/boot";
import { os, useOS } from "@/os/store";

const KEY = "beselfos:settings";
const boot = () => useOS.getState().boot;

// A plain host for tables that are not the real one: useOS cannot hold stage
// "a". The state is mutated in place, so take no snapshots from it.
function hostAt<K extends string>(stage: K): BootApi<K> {
  const state: BootHost<K> = {
    boot: { ...initialBoot, stage },
    settings: { showLogin: false },
  };
  return { getState: () => state, setState: (recipe) => recipe(state) };
}

// Calls advance() until the stage arrives. The limit stops a bug that leaves
// the slice on a stage with no next from hanging the run.
function walkTo(stage: BootStage, actions: { advance(): void } = os.boot) {
  for (let i = 0; i < 12 && boot().stage !== stage; i++) actions.advance();
  expect(boot().stage).toBe(stage);
}

// The real table with every onEnter replaced.
function tableWith(
  onEnter: (name: BootStage) => (ctx: StageContext) => void,
): StageTable<BootStage> {
  const copy = { ...BOOT_STAGES } as StageTable<BootStage>;
  for (const name of Object.keys(copy) as BootStage[]) {
    copy[name] = { ...copy[name], onEnter: onEnter(name) };
  }
  return copy;
}

const noTimers = { full: null, fast: null, skip: null } as const;

beforeEach(() => {
  useOS.setState(useOS.getInitialState(), true);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shape", () => {
  it("initial state", () => {
    expect(useOS.getInitialState().boot).toEqual({
      stage: "off",
      mode: "full",
      startedAt: null,
      lineIndex: 0,
      bootLogMs: 0,
    });
  });

  it("action list", () => {
    expect(Object.keys(os.boot).sort()).toEqual([
      "advance",
      "powerOn",
      "restart",
      "send",
      "setBootLogMs",
      "setLineIndex",
      "shutdown",
      "skip",
      "start",
    ]);
  });
});

describe("no per-stage branches", () => {
  it("runs on any table", () => {
    const def = (extra: Partial<StageDef>): StageDef => ({
      duration: noTimers,
      onEnter: () => {},
      next: null,
      ...extra,
    });
    const table = {
      a: def({}),
      b: def({ next: "c", enteredBy: { go: ["a"] } }),
      c: def({}),
    };
    const host = hostAt<keyof typeof table>("a");
    const actions = createBootActions(host, table);
    actions.send("go");
    expect(host.getState().boot.stage).toBe("b");
    actions.advance();
    expect(host.getState().boot.stage).toBe("c");
  });

  it("adding a stage needs no slice change", () => {
    // The machine enters the first entry, in table order, that lists the
    // event from the current stage. So the event must be one the real table
    // does not use, or a real entry would take it.
    expect(bootMachine.stageForEvent("idle", "desktop")).toBeNull();
    const table = {
      ...BOOT_STAGES,
      screensaver: {
        duration: noTimers,
        onEnter: () => {},
        next: "desktop",
        enteredBy: { idle: ["desktop"] },
      },
    } satisfies StageTable;
    const host = hostAt<keyof typeof table>("desktop");
    const actions = createBootActions(host, table);
    actions.send("idle");
    expect(host.getState().boot.stage).toBe("screensaver");
    actions.advance();
    expect(host.getState().boot.stage).toBe("desktop");
  });

  it("advance follows the table", () => {
    os.boot.start("full");
    expect(boot().stage).toBe("lid-opening");
    for (const next of [
      "power-on",
      "firmware",
      "boot-log",
      "desktop-enter",
      "desktop",
    ]) {
      os.boot.advance();
      expect(boot().stage).toBe(next);
    }
    os.boot.advance();
    expect(boot().stage).toBe("desktop");
  });

  it.each([
    ["full", "login"],
    ["fast", "login"],
    ["skip", "desktop-enter"],
  ] as const)("reads showLogin live in %s", (mode, after) => {
    os.boot.start(mode);
    walkTo("firmware");
    // Changed after start, so a slice that read it once would miss it.
    os.settings.update({ showLogin: true });
    walkTo("boot-log");
    os.boot.advance();
    expect(boot().stage).toBe(after);
  });

  it("invalid events do nothing", () => {
    os.boot.start("fast");
    os.boot.setLineIndex(3);
    let snapshot = boot();
    os.boot.send("nope");
    expect(boot()).toEqual(snapshot);

    walkTo("power-on");
    snapshot = boot();
    os.boot.skip();
    expect(boot()).toEqual(snapshot);

    walkTo("firmware");
    snapshot = boot();
    os.boot.shutdown();
    expect(boot()).toEqual(snapshot);
  });

  it.each(["firmware", "boot-log"] as const)(
    "skip jumps to desktop-enter from %s",
    (from) => {
      os.boot.start("fast");
      walkTo(from);
      os.boot.skip();
      expect(boot().stage).toBe("desktop-enter");
      expect(boot().mode).toBe("fast");
    },
  );
});

describe("hand-offs from the stage table", () => {
  it.each(["full", "fast", "skip"] as const)(
    "start sets the mode before entering: %s",
    (mode) => {
      // Seeded to a different mode, or the full row could never fail.
      const other: BootMode = mode === "full" ? "fast" : "full";
      useOS.setState((s) => {
        s.boot.mode = other;
      });
      const spy = vi.fn();
      const table = tableWith((name) =>
        name === "lid-opening" ? spy : () => {},
      );
      createBootActions(useOS, table).start(mode);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0].mode).toBe(mode);
    },
  );

  it("start is ignored unless the machine is off", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    os.boot.start("skip");
    walkTo("desktop");
    os.boot.setLineIndex(3);
    vi.setSystemTime(5000);
    const snapshot = boot();
    os.boot.start("fast");
    expect(boot()).toEqual(snapshot);
  });

  it.each(["fast", "skip"] as const)(
    "restart replays a full boot from %s",
    (mode) => {
      os.boot.start(mode);
      walkTo("desktop");
      os.boot.restart();
      expect(boot().stage).toBe("restarting");
      expect(boot().mode).toBe("full");
      os.boot.advance();
      expect(boot().stage).toBe("power-on");
    },
  );

  it("restart away from desktop changes nothing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    os.boot.start("fast");
    walkTo("power-on");
    os.boot.setLineIndex(3);
    vi.setSystemTime(5000);
    const snapshot = boot();
    os.boot.restart();
    expect(boot()).toEqual(snapshot);
  });

  it("every stage is entered, including zero-duration ones", () => {
    const entered: string[] = [];
    const table = tableWith(() => () => {
      // Reads the committed stage, so a call inside the recipe would differ.
      entered.push(boot().stage);
    });
    const actions = createBootActions(useOS, table);
    actions.start("skip");
    walkTo("desktop", actions);
    expect(entered).toEqual([
      "lid-opening",
      "power-on",
      "firmware",
      "boot-log",
      "desktop-enter",
      "desktop",
    ]);
  });

  it("named actions enter through the table", () => {
    const entered: [string, BootMode][] = [];
    const table = tableWith(() => (ctx) => {
      entered.push([boot().stage, ctx.mode]);
    });
    const actions = createBootActions(useOS, table);
    actions.start("fast");
    walkTo("firmware", actions);
    actions.skip();
    walkTo("desktop", actions);
    actions.restart();
    walkTo("desktop", actions);
    actions.shutdown();
    walkTo("off", actions);
    actions.powerOn();
    expect(entered).toEqual([
      ["lid-opening", "fast"],
      ["power-on", "fast"],
      ["firmware", "fast"],
      ["desktop-enter", "fast"],
      ["desktop", "fast"],
      ["restarting", "full"],
      ["power-on", "full"],
      ["firmware", "full"],
      ["boot-log", "full"],
      ["desktop-enter", "full"],
      ["desktop", "full"],
      ["shutting-down", "full"],
      ["off", "full"],
      ["lid-opening", "full"],
    ]);
  });

  it("powerOn is ignored unless the machine is off", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    os.boot.start("fast");
    walkTo("desktop");
    os.boot.setLineIndex(3);
    vi.setSystemTime(5000);
    const snapshot = boot();
    os.boot.powerOn();
    expect(boot()).toEqual(snapshot);
  });
});

describe("other behaviour", () => {
  it("powerOn boots in full mode", () => {
    os.boot.start("skip");
    walkTo("desktop");
    os.boot.shutdown();
    walkTo("off");
    os.boot.powerOn();
    expect(boot().stage).toBe("lid-opening");
    expect(boot().mode).toBe("full");
  });

  it("startedAt marks each boot", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    os.boot.start("full");
    expect(boot().startedAt).toBe(1000);
    walkTo("desktop");

    vi.setSystemTime(2000);
    os.boot.restart();
    expect(boot().startedAt).toBe(2000);
    walkTo("desktop");

    os.boot.shutdown();
    walkTo("off");
    vi.setSystemTime(3000);
    os.boot.powerOn();
    expect(boot().startedAt).toBe(3000);

    vi.setSystemTime(9000);
    os.boot.advance();
    expect(boot().startedAt).toBe(3000);
  });

  it.each([
    ["start", () => os.boot.start("fast")],
    [
      "restart",
      () => {
        os.boot.start("full");
        walkTo("desktop");
        os.boot.setLineIndex(7);
        os.boot.restart();
      },
    ],
    [
      "powerOn",
      () => {
        os.boot.start("full");
        walkTo("desktop");
        os.boot.shutdown();
        walkTo("off");
        os.boot.setLineIndex(7);
        os.boot.powerOn();
      },
    ],
  ])("lineIndex resets on %s", (name, run) => {
    if (name === "start") os.boot.setLineIndex(7);
    run();
    expect(boot().lineIndex).toBe(0);
  });

  it("advance leaves lineIndex alone", () => {
    os.boot.start("full");
    os.boot.setLineIndex(7);
    os.boot.advance();
    expect(boot().lineIndex).toBe(7);
  });

  it("bootContext carries live values", () => {
    const duration = () =>
      bootMachine.durationFor("boot-log", bootContext(useOS.getState()));
    os.boot.setBootLogMs(1234);
    expect(duration()).toBe(1234);
    os.boot.setBootLogMs(5678);
    expect(duration()).toBe(5678);

    useOS.setState((s) => {
      s.boot.mode = "fast";
      s.boot.bootLogMs = 4321;
      s.settings.showLogin = true;
    });
    expect(bootContext(useOS.getState())).toEqual({
      mode: "fast",
      showLogin: true,
      bootLogMs: 4321,
    });
  });
});

describe("boot state and persistence", () => {
  it("survives a rehydrate and is never stored", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ state: { settings: { showLogin: true } }, version: 0 }),
    );
    vi.resetModules();
    const mod = await import("@/os/store");
    mod.os.boot.start("fast");
    mod.os.boot.advance();
    mod.os.boot.setLineIndex(3);
    const snapshot = mod.useOS.getState().boot;

    mod.rehydrateSettings();
    expect(mod.useOS.getState().boot).toEqual(snapshot);
    expect(mod.useOS.getState().settings.showLogin).toBe(true);

    const setItem = vi.spyOn(Storage.prototype, "setItem");
    mod.os.boot.advance();
    mod.os.boot.setLineIndex(4);
    expect(setItem).toHaveBeenCalledTimes(0);
    mod.os.settings.update({ sound: true });
    expect(setItem).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    expect(Object.keys(stored.state)).toEqual(["settings"]);
  });
});
