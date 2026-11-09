"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { getApp } from "../apps/registry";
import { shortcuts } from "../input/shortcuts";
import { focusedWindow, os, useOS } from "../store";
import { Icon } from "../ui/Icon";
import { firstIndex, nextIndex, switcherOrder } from "./altTab";
import { focusInto } from "./focusOrder";

// The Alt+Tab switcher (plan 2.5, 4.7, #102). Pressing Tab while Alt is held
// shows a centred strip of every window; each further Tab, or Shift+Tab, moves
// the selection and wraps; releasing Alt switches to the chosen window. While
// the desktop is mounted, the two registrations below beat #64's cycleFocus
// default, which switches on keydown and skips minimised windows. Outside the
// desktop the default still runs.
//
// The session lives in a controller made once per mount. It keeps the ids that
// were listed and the way to stop listening in plain variables, so a handler
// never reads stale React state; the strip reads the ids through a store, and
// the selected index through the OS store (`shell.altTabIndex`, plan 2.2).
// State is set only inside handlers, never in an effect.

// Whole literal strings, so Tailwind finds every class.
const OVERLAY =
  "pointer-events-none absolute inset-0 flex items-center justify-center p-4";
const STRIP =
  "pointer-events-auto flex max-w-full flex-wrap justify-center gap-2 rounded-os-lg bg-os-panel/95 p-3 shadow-os-window";
const OPTION =
  "flex w-24 flex-col items-center gap-1 rounded-os-md p-2 text-os-panel-fg";

function createController() {
  let ids: readonly string[] | null = null;
  let stopListening: (() => void) | null = null;
  const subscribers = new Set<() => void>();
  const emit = () => {
    for (const notify of subscribers) notify();
  };

  /** Closes the strip with no change: Esc, a blur, and unmount. */
  const end = () => {
    stopListening?.();
    stopListening = null;
    if (ids === null) return;
    ids = null;
    os.shell.setAltTabIndex(0);
    emit();
  };

  /**
   * Switches to a window: restores it if it is minimised, raises it if not.
   * The store change and the strip's close run inside flushSync, so the frame
   * is drawn (a minimised one stays visibility: hidden until React renders it,
   * and a browser will not focus inside a hidden box) before focusInto moves
   * the keyboard there.
   */
  const commit = (id: string) => {
    const win = useOS.getState().windows.items.find((w) => w.id === id);
    flushSync(() => {
      if (win?.status === "minimized") os.windows.restoreWindow(id);
      else if (win) os.windows.focusWindow(id);
      end();
    });
    if (win) focusInto(id);
  };

  /**
   * Added in the same handler that opens the strip, not in a later effect, so
   * a quick release is never missed. Keydown and keyup are in the capture phase
   * on window, so they run before anything else. The blur listener is not:
   * blur does not bubble, but a capture listener on window would hear every
   * element's blur, and the first press closes the App Grid, whose cleanup
   * moves focus; a click on an option moves it too. Only the window's own blur
   * (the browser lost focus) cancels.
   */
  const listen = () => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      end();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Alt") return;
      // Alt alone would otherwise focus the browser's menu bar.
      e.preventDefault();
      const id = ids?.[useOS.getState().shell.altTabIndex];
      if (id === undefined) end();
      else commit(id);
    };
    const onBlur = (e: FocusEvent) => {
      // The window's own blur: the target is the object the listener is on.
      if (e.target === e.currentTarget) end();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    stopListening = () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  };

  const press = (dir: 1 | -1) => {
    if (ids !== null) {
      os.shell.setAltTabIndex(
        nextIndex(useOS.getState().shell.altTabIndex, ids.length, dir),
      );
      return;
    }
    // Closes the grid, any popover and any menu, so the strip is alone.
    os.shell.closeAll();
    const state = useOS.getState();
    const order = switcherOrder(state.windows.items).map((w) => w.id);
    if (order.length === 0) return;
    ids = order;
    listen();
    os.shell.setAltTabIndex(
      firstIndex(order.length, focusedWindow(state) !== null, dir),
    );
    emit();
  };

  return {
    subscribe(notify: () => void): () => void {
      subscribers.add(notify);
      return () => void subscribers.delete(notify);
    },
    get: (): readonly string[] | null => ids,
    commit,
    /** Registers the two combos. The cleanup unregisters them and ends a session. */
    install(): () => void {
      const off = [
        shortcuts.register("global", "Alt+Tab", () => press(1)),
        shortcuts.register("global", "Alt+Shift+Tab", () => press(-1)),
      ];
      return () => {
        for (const unregister of off) unregister();
        end();
      };
    },
  };
}

export function AltTab() {
  const [controller] = useState(createController);
  useEffect(() => controller.install(), [controller]);
  const ids = useSyncExternalStore(
    controller.subscribe,
    controller.get,
    controller.get,
  );
  return ids === null ? null : <Strip ids={ids} controller={controller} />;
}

// Its own component, so the windows are read only while the strip is open: a
// window drag changes `windows.items` every frame.
function Strip({
  ids,
  controller,
}: {
  ids: readonly string[];
  controller: ReturnType<typeof createController>;
}) {
  const selected = useOS((s) => s.shell.altTabIndex);
  const items = useOS((s) => s.windows.items);

  // A window that has gone since the strip opened renders nothing.
  const options = ids.flatMap((id, position) => {
    const win = items.find((w) => w.id === id);
    return win ? [{ win, position }] : [];
  });

  return (
    <div className={OVERLAY}>
      <div
        data-alt-tab=""
        role="listbox"
        aria-label="Switch windows"
        className={STRIP}
      >
        {options.map(({ win, position }) => {
          const icon = getApp(win.appId)?.icon;
          return (
            <div
              key={win.id}
              role="option"
              aria-selected={position === selected}
              data-minimized={win.status === "minimized" ? "" : undefined}
              onClick={() => controller.commit(win.id)}
              className={`${OPTION} ${
                position === selected ? "ring-2 ring-os-accent" : ""
              } ${win.status === "minimized" ? "opacity-60" : ""}`}
            >
              {icon && <Icon src={icon} size={64} />}
              <span className="w-full truncate text-center text-sm">
                {win.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
