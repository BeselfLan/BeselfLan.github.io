import type { OSApi } from "./index";

export interface Point {
  x: number;
  y: number;
}
export interface WorkArea {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type ScreenMode = "laptop" | "fullscreen";

export interface WindowState {
  id: string;
  appId: string;
  args: unknown;
  title: string;
  /** Restore geometry: kept while maximised. */
  position: Point;
  size: { width: number; height: number };
  status: "open" | "minimized";
  maximized: boolean;
  /** Copied from the app's capabilities at open, so selectors only need state. */
  alwaysOnTop: boolean;
  /** Only ever goes up, so compare relatively. */
  z: number;
  openedAt: number;
  /** [FUTURE] reserved, stays undefined. */
  workspaceId?: string;
}

export interface WindowManagerState {
  items: WindowState[];
  mode: ScreenMode;
  workArea: WorkArea;
}

export interface WindowCloseContext {
  windowId: string;
  args: unknown;
}

/** The fields of the 4.1 app definition that this slice reads. */
export interface WindowApp {
  id: string;
  name: string;
  window: {
    width: number;
    height: number;
    initialPosition?: "cascade" | "center" | Point;
  };
  capabilities: { maximize: boolean; alwaysOnTop?: boolean };
  singleton: boolean;
  defaultArgs?: unknown;
  // Method syntax on purpose: a property here would reject every
  // definition typed with specific args under strictFunctionTypes.
  instanceKey?(args: unknown): string;
  title?(args: unknown): string;
  onBeforeClose?(ctx: WindowCloseContext): boolean | Promise<boolean>;
}
export type AppLookup = (appId: string) => WindowApp | undefined;

export const initialWindows: WindowManagerState = {
  items: [],
  mode: "laptop",
  workArea: { x: 64, y: 32, w: 1376, h: 868 },
};

type Host = { windows: WindowManagerState };

/** Highest z among open windows, or null. Not the last of orderedWindows. */
export function focusedWindow(s: Host): WindowState | null {
  let top: WindowState | null = null;
  for (const w of s.windows.items) {
    if (w.status === "open" && (top === null || w.z > top.z)) top = w;
  }
  return top;
}

/**
 * Builds a new array on every call, minimised windows included (they stay
 * mounted). zustand 5 passes selectors straight to useSyncExternalStore, so
 * read it in a component only through `useShallow`, or it loops.
 */
export function orderedWindows(s: Host): WindowState[] {
  return [...s.windows.items].sort(
    (a, b) => Number(a.alwaysOnTop) - Number(b.alwaysOnTop) || a.z - b.z,
  );
}

/** Builds a new array on every call: same `useShallow` rule as orderedWindows. */
export function windowsForApp(s: Host, appId: string): WindowState[] {
  return s.windows.items.filter((w) => w.appId === appId);
}

/** Minimised counts as running. */
export function isAppRunning(s: Host, appId: string): boolean {
  return s.windows.items.some((w) => w.appId === appId);
}

const STEP = 32;

function placement(app: WindowApp, area: WorkArea, last?: WindowState): Point {
  const { width, height } = app.window;
  // Upper bound first, so an oversized window anchors to the top left.
  const clamp = (p: Point): Point => ({
    x: Math.max(area.x, Math.min(p.x, area.x + area.w - width)),
    y: Math.max(area.y, Math.min(p.y, area.y + area.h - height)),
  });
  const want = app.window.initialPosition;
  if (typeof want === "object") return clamp(want);
  if (want === "center") {
    return clamp({
      x: Math.round(area.x + (area.w - width) / 2),
      y: Math.round(area.y + (area.h - height) / 2),
    });
  }
  const origin = { x: area.x + STEP, y: area.y + STEP };
  let next = last
    ? { x: last.position.x + STEP, y: last.position.y + STEP }
    : origin;
  if (next.x + width > area.x + area.w || next.y + height > area.y + area.h) {
    next = origin;
  }
  return clamp(next);
}

export function createWindowActions(api: OSApi) {
  let lookup: AppLookup = () => undefined;
  let topZ = 0;

  /** Raising the top window writes nothing. */
  const raise = (s: Host, win: WindowState): void => {
    if (focusedWindow(s)?.id !== win.id) win.z = ++topZ;
  };

  return {
    setAppLookup(next: AppLookup): void {
      lookup = next;
    },

    setScreen(next: { mode: ScreenMode; workArea: WorkArea }): void {
      api.setState((s) => {
        s.windows.mode = next.mode;
        Object.assign(s.windows.workArea, next.workArea);
      });
    },

    /** Returns the window id. Throws, before any write, on a bad request. */
    openApp(appId: string, args?: unknown): string {
      const app = lookup(appId);
      if (!app) throw new Error(`openApp: unknown app "${appId}"`);
      const resolved = args === undefined ? app.defaultArgs : args;
      let id = app.id;
      if (!app.singleton) {
        if (!app.instanceKey) {
          throw new Error(`openApp: "${appId}" needs an instanceKey`);
        }
        id = `${app.id}:${app.instanceKey(resolved)}`;
      }
      api.setState((s) => {
        const w = s.windows.items.find((x) => x.id === id);
        if (w) {
          w.status = "open";
          raise(s, w);
          if (args !== undefined) {
            w.args = args;
            if (app.title) w.title = app.title(args);
          }
          return;
        }
        const area = s.windows.workArea;
        s.windows.items.push({
          id,
          appId: app.id,
          args: resolved,
          title: app.title?.(resolved) ?? app.name,
          position: placement(app, area, s.windows.items.at(-1)),
          size: { width: app.window.width, height: app.window.height },
          status: "open",
          maximized: s.windows.mode === "fullscreen",
          alwaysOnTop: app.capabilities.alwaysOnTop === true,
          z: ++topZ,
          openedAt: Date.now(),
        });
      });
      return id;
    },

    /** Raises an open window. Minimised ones need restoreWindow. */
    focusWindow(id: string): void {
      api.setState((s) => {
        const w = s.windows.items.find((x) => x.id === id);
        if (w?.status === "open") raise(s, w);
      });
    },

    minimizeWindow(id: string): void {
      api.setState((s) => {
        const w = s.windows.items.find((x) => x.id === id);
        if (w) w.status = "minimized";
      });
    },

    restoreWindow(id: string): void {
      api.setState((s) => {
        const w = s.windows.items.find((x) => x.id === id);
        if (!w) return;
        w.status = "open";
        raise(s, w);
      });
    },

    moveWindow(id: string, to: Point): void {
      api.setState((s) => {
        const w = s.windows.items.find((x) => x.id === id);
        // Copied: immer freezes what it stores and a drag may reuse `to`.
        if (w) w.position = { x: to.x, y: to.y };
      });
    },

    setTitle(id: string, title: string): void {
      api.setState((s) => {
        const w = s.windows.items.find((x) => x.id === id);
        if (w) w.title = title;
      });
    },

    minimizeAll(): void {
      api.setState((s) => {
        for (const w of s.windows.items) w.status = "minimized";
      });
    },

    /**
     * Rotates the stack of open windows. 1 sends the focused one to the back,
     * so repeated calls visit windows most recent first. -1 is the inverse.
     */
    cycleFocus(dir: 1 | -1): void {
      api.setState((s) => {
        const open = s.windows.items
          .filter((w) => w.status === "open")
          .sort((a, b) => a.z - b.z);
        if (open.length < 2) return;
        const order =
          dir === 1
            ? [open[open.length - 1], ...open.slice(0, -1)]
            : [...open.slice(1), open[0]];
        for (const w of order) w.z = ++topZ;
      });
    },
  };
}
