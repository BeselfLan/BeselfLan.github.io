import type { BootLine } from "./bootScript";

// One boot log script, held outside React state. BootSequence builds the
// script in an effect and reads it with useSyncExternalStore: the recommended
// react-hooks rules reject setting state from an effect, and reading a ref
// while rendering. No React here, and nothing at module scope but the constant.

/** The server snapshot, and the value before the first build. */
export const NO_LINES: readonly BootLine[] = [];

export interface ScriptStore {
  /** The same array until `set` is called, as useSyncExternalStore needs. */
  get(): readonly BootLine[];
  set(lines: readonly BootLine[]): void;
  /** Returns the function that unsubscribes. */
  subscribe(listener: () => void): () => void;
}

export function createScriptStore(): ScriptStore {
  let lines = NO_LINES;
  const listeners = new Set<() => void>();
  return {
    get: () => lines,
    set(next) {
      lines = next;
      // A copy, so a listener that unsubscribes does not skip the next one.
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
