import {
  createStageMachine,
  type BootMode,
  type BootStage,
  type StageContext,
  type StageTable,
} from "../boot/stages";

export interface BootState<K extends string = BootStage> {
  stage: K;
  mode: BootMode;
  startedAt: number | null;
  lineIndex: number;
  bootLogMs: number;
}

/** What the boot actions need from the store, so tests can pass other tables. */
export interface BootHost<K extends string = BootStage> {
  boot: BootState<K>;
  settings: { showLogin: boolean };
}

export interface BootApi<K extends string = BootStage> {
  getState(): BootHost<K>;
  setState(recipe: (s: BootHost<K>) => void): void;
}

// Constant: nothing here may read the clock or the browser, so the server and
// the first client render agree.
export const initialBoot: BootState = {
  stage: "off",
  mode: "full",
  startedAt: null,
  lineIndex: 0,
  bootLogMs: 0,
};

/** The live values the stage table needs for durations and `when` checks. */
export function bootContext<K extends string>(
  state: BootHost<K>,
): StageContext {
  return {
    mode: state.boot.mode,
    showLogin: state.settings.showLogin,
    bootLogMs: state.boot.bootLogMs,
  };
}

/**
 * Every transition comes from `table`, so this file names no stage. The caller
 * runs the timers: `advance()` moves one stage and sets none.
 */
export function createBootActions<K extends string>(
  api: BootApi<K>,
  table: StageTable<K>,
) {
  const machine = createStageMachine(table);

  // The one place a stage is entered: write the state, then run `onEnter`
  // outside the recipe so it sees the committed state.
  function enter(target: K, fields: Partial<BootState<K>>): void {
    api.setState((s) => {
      Object.assign(s.boot, fields);
      s.boot.stage = target;
    });
    table[target].onEnter(bootContext(api.getState()));
  }

  // Nothing is written unless the table allows the event from this stage.
  function send(
    event: string,
    fields: () => Partial<BootState<K>> = () => ({}),
  ) {
    const target = machine.stageForEvent(event, api.getState().boot.stage);
    if (target === null) return;
    enter(target, fields());
  }

  const freshBoot = (mode: BootMode): Partial<BootState<K>> => ({
    mode,
    startedAt: Date.now(),
    lineIndex: 0,
  });

  return {
    /** Fires the event for an action that has no named wrapper. */
    send(event: string): void {
      send(event);
    },
    start(mode: BootMode): void {
      send("powerOn", () => freshBoot(mode));
    },
    /** Pressing power is a fresh boot, so it always uses the full mode. */
    powerOn(): void {
      send("powerOn", () => freshBoot("full"));
    },
    /** A restart replays a full boot, whatever mode the session loaded in. */
    restart(): void {
      send("restart", () => freshBoot("full"));
    },
    shutdown(): void {
      send("shutdown");
    },
    /** The keypress: jumps to the entry stage. It never touches `mode`. */
    skip(): void {
      send("skip");
    },
    advance(): void {
      const next = machine.nextStage(
        api.getState().boot.stage,
        bootContext(api.getState()),
      );
      if (next !== null) enter(next, {});
    },
    setLineIndex(i: number): void {
      api.setState((s) => {
        s.boot.lineIndex = i;
      });
    },
    setBootLogMs(ms: number): void {
      api.setState((s) => {
        s.boot.bootLogMs = ms;
      });
    },
  };
}
