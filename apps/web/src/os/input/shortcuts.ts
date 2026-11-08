import { focusedWindow, os, useOS } from "../store";

// The keyboard of the OS (plan 2.5). Nothing here reads window or document
// until installShortcuts() runs, so the server build can import this file.

/** "global", or the id of a window: its shortcuts run only while it is focused. */
export type ShortcutScope = "global" | (string & {});

/** A shortcut as an app declares it. */
export interface Shortcut {
  /** Modifiers `Ctrl`, `Alt`, `Shift`, `Meta`, then one key, joined by `+`. */
  combo: string;
  handler(e: KeyboardEvent): void;
  description?: string;
}

type Handler = (e: KeyboardEvent) => void;
interface Entry {
  /** Canonical form, so `Shift+Alt+Tab` and `alt+shift+tab` are one combo. */
  combo: string;
  handler: Handler;
}

// Fixed order, so a combo has one spelling.
const MODIFIERS = ["ctrl", "alt", "shift", "meta"] as const;

function canonical(mods: ReadonlySet<string>, key: string): string {
  return [...MODIFIERS.filter((m) => mods.has(m)), key].join("+");
}

/** Throws on an empty combo, an unknown modifier, or modifiers with no key. */
function parseCombo(combo: string): string {
  const parts = combo.split("+").map((p) => p.trim());
  // "Ctrl++" and "+" are the plus key.
  const plus =
    parts.length >= 2 &&
    parts[parts.length - 1] === "" &&
    parts[parts.length - 2] === "";
  const key = plus ? "+" : parts[parts.length - 1].toLowerCase();
  const names = parts.slice(0, plus ? -2 : -1).map((p) => p.toLowerCase());
  if (key === "") throw new Error(`shortcut "${combo}" has no key`);
  for (const name of names) {
    if (!(MODIFIERS as readonly string[]).includes(name)) {
      throw new Error(`shortcut "${combo}" has an unknown modifier "${name}"`);
    }
  }
  // Meta alone is Super: it fires on release. No other modifier can be a key.
  if ((MODIFIERS as readonly string[]).includes(key)) {
    if (key !== "meta" || names.length > 0) {
      throw new Error(`shortcut "${combo}" is only modifiers`);
    }
  }
  return canonical(new Set(names), key === "space" ? " " : key);
}

// Module state, shared by every install. Newest last.
const registry = new Map<string, Entry[]>();

export const shortcuts = {
  /**
   * The newest handler in a scope wins. A handled event gets preventDefault().
   * Returns the unregister, which is safe to call twice.
   */
  register(scope: ShortcutScope, combo: string, handler: Handler): () => void {
    const entry: Entry = { combo: parseCombo(combo), handler };
    const list = registry.get(scope) ?? [];
    registry.set(scope, [...list, entry]);
    return () => {
      const now = registry.get(scope);
      if (!now?.includes(entry)) return;
      registry.set(
        scope,
        now.filter((e) => e !== entry),
      );
    };
  },
};

function find(scope: string, wanted: ReadonlySet<string>): Entry | undefined {
  const list = registry.get(scope);
  if (!list) return undefined;
  for (let i = list.length - 1; i >= 0; i--) {
    if (wanted.has(list[i].combo)) return list[i];
  }
  return undefined;
}

// The plan 2.5 defaults are a fallback layer, not registrations: an app or the
// dock (#16) beats them whether it registers before or after install. A
// default returns false when it did nothing, so the key passes through.
const DEFAULTS = new Map<string, () => boolean>([
  [
    "alt+f4",
    () => {
      const win = focusedWindow(useOS.getState());
      if (!win) return false;
      void os.windows.closeWindow(win.id);
      return true;
    },
  ],
  [
    "meta",
    () => {
      os.shell.toggleActivities();
      return true;
    },
  ],
  [
    "alt+tab",
    () => {
      os.windows.cycleFocus(1);
      return true;
    },
  ],
  [
    "alt+shift+tab",
    () => {
      os.windows.cycleFocus(-1);
      return true;
    },
  ],
  [
    "escape",
    () => {
      os.shell.closeAll();
      return true;
    },
  ],
]);

/** Handlers of the focused window first, then global, then the defaults. */
function dispatch(e: KeyboardEvent, mods: ReadonlySet<string>, keys: string[]) {
  const wanted = new Set(keys.map((k) => canonical(mods, k)));
  const focused = focusedWindow(useOS.getState())?.id;
  const entry =
    (focused === undefined ? undefined : find(focused, wanted)) ??
    find("global", wanted);
  if (entry) {
    e.preventDefault();
    entry.handler(e);
    return;
  }
  for (const combo of wanted) {
    if (DEFAULTS.get(combo)?.()) {
      e.preventDefault();
      return;
    }
  }
}

// macOS Alt changes e.key, so a letter or digit also matches by its code.
function keysOf(e: KeyboardEvent): string[] {
  const keys = [e.key.toLowerCase()];
  const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(e.code);
  if (m) keys.push((m[1] ?? m[2]).toLowerCase());
  return keys;
}

function modsOf(e: KeyboardEvent): Set<string> {
  const mods = new Set<string>();
  if (e.ctrlKey) mods.add("ctrl");
  if (e.altKey) mods.add("alt");
  if (e.shiftKey) mods.add("shift");
  if (e.metaKey) mods.add("meta");
  return mods;
}

// closest(), because jsdom has no isContentEditable.
const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const isEditable = (t: EventTarget | null): boolean =>
  t instanceof Element && t.closest(EDITABLE) !== null;

/**
 * Turns the key listeners on, with the plan 2.5 defaults: Alt+F4 closes the
 * focused window, Super (Meta released alone) toggles Activities, Alt+Tab and
 * Alt+Shift+Tab cycle focus, Escape closes Activities, the popover and the
 * context menu. Returns the uninstall.
 *
 * The listeners bubble on `target`, so a menu's own handler and the popover's
 * listener see a key first, and an event they already handled (defaultPrevented)
 * is ignored here. The browser or the OS may take Alt+Tab, Alt+F4 and Super
 * before the page does.
 */
export function installShortcuts(target: Window = window): () => void {
  // Meta went down and nothing else has since: its release is a Super tap.
  let superArmed = false;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Meta") {
      superArmed = !e.defaultPrevented;
      return;
    }
    superArmed = false;
    if (e.defaultPrevented || e.isComposing) return;
    const mods = modsOf(e);
    const chord = mods.has("ctrl") || mods.has("alt") || mods.has("meta");
    // Typing: a plain key belongs to the field. Escape still closes things.
    if (!chord && e.key !== "Escape" && isEditable(e.target)) return;
    dispatch(e, mods, keysOf(e));
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.key !== "Meta" || !superArmed) return;
    superArmed = false;
    if (e.defaultPrevented || e.isComposing) return;
    dispatch(e, new Set(), ["meta"]);
  };

  const onBlur = (): void => {
    superArmed = false;
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);
  return () => {
    target.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("keyup", onKeyUp);
    target.removeEventListener("blur", onBlur);
  };
}
