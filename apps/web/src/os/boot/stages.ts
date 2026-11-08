// Boot stage machine as one data table (contract 4.3, D15, #34).
// Pure data: no imports, no window, no timers, safe to import on the server.

export type BootMode = "full" | "fast" | "skip";

export interface StageContext {
  mode: BootMode;
  showLogin: boolean; // settings.showLogin
  bootLogMs: number; // summed boot log delays, supplied by #13
}

export interface StageDef {
  /** Milliseconds per mode. null: no timer. "computed": use ctx.bootLogMs. */
  duration: Record<BootMode, number | "computed" | null>;
  onEnter: (ctx: StageContext) => void;
  /** Where advance() goes. null: nowhere. */
  next: string | null;
  /** Maps an event name to the stages it is valid from. */
  enteredBy?: Readonly<Record<string, readonly string[]>>;
  /** If it returns false, a walk passes over this stage. */
  when?: (ctx: StageContext) => boolean;
}

export type StageTable<K extends string = string> = Record<K, StageDef>;

const noop = (): void => {};

export const BOOT_STAGES = {
  off: {
    duration: { full: null, fast: null, skip: null },
    onEnter: noop,
    next: null,
  },
  "lid-opening": {
    duration: { full: 1000, fast: 0, skip: 0 },
    onEnter: noop,
    next: "power-on",
    enteredBy: { powerOn: ["off"] },
  },
  "power-on": {
    duration: { full: 300, fast: 0, skip: 0 },
    onEnter: noop,
    next: "firmware",
  },
  firmware: {
    duration: { full: 500, fast: 0, skip: 0 },
    onEnter: noop,
    next: "boot-log",
  },
  "boot-log": {
    duration: { full: "computed", fast: 0, skip: 0 },
    onEnter: noop,
    next: "login",
  },
  login: {
    duration: { full: null, fast: null, skip: null },
    onEnter: noop,
    next: "desktop-enter",
    // Lock in the System menu (plan 4.2) enters login from the desktop.
    // `when` applies only to walks, so a lock enters login in any mode.
    // The System menu sends "lock" only while settings.showLogin is on.
    enteredBy: { lock: ["desktop"] },
    when: (ctx) => ctx.showLogin && ctx.mode !== "skip",
  },
  "desktop-enter": {
    duration: { full: 400, fast: 400, skip: 0 },
    onEnter: noop,
    next: "desktop",
    enteredBy: { skip: ["firmware", "boot-log"] },
  },
  desktop: {
    duration: { full: null, fast: null, skip: null },
    onEnter: noop,
    next: null,
  },
  "shutting-down": {
    duration: { full: 600, fast: 600, skip: 600 },
    onEnter: noop,
    next: "off",
    enteredBy: { shutdown: ["desktop"] },
  },
  restarting: {
    duration: { full: 600, fast: 600, skip: 600 },
    onEnter: noop,
    next: "power-on",
    enteredBy: { restart: ["desktop"] },
  },
} satisfies StageTable;

export type BootStage = keyof typeof BOOT_STAGES;

export function createStageMachine<K extends string>(
  table: StageTable<K>,
): {
  durationFor(stage: K, ctx: StageContext): number | null;
  nextStage(stage: K, ctx: StageContext): K | null;
  stageForEvent(event: string, current: K): K | null;
} {
  const keys = Object.keys(table) as K[];
  return {
    durationFor(stage, ctx) {
      const d = table[stage].duration[ctx.mode];
      return d === "computed" ? ctx.bootLogMs : d;
    },
    nextStage(stage, ctx) {
      let next = table[stage].next as K | null;
      while (next !== null) {
        const when = table[next].when;
        if (!when || when(ctx)) return next;
        next = table[next].next as K | null;
      }
      return null;
    },
    stageForEvent(event, current) {
      for (const key of keys) {
        if (table[key].enteredBy?.[event]?.includes(current)) return key;
      }
      return null;
    },
  };
}

export const bootMachine = createStageMachine(BOOT_STAGES);
