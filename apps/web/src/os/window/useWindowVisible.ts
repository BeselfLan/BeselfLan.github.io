"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";
import { useOS } from "../store";

/**
 * The frame provides its window id, so an app calls useWindowVisible() with no
 * arguments.
 */
export const WindowIdContext = createContext<string | null>(null);

const pageVisible = (): boolean =>
  typeof document !== "undefined" && document.visibilityState === "visible";

/** True while the window is open (not minimised, not closed) on a visible page. */
export function isWindowVisible(id: string): boolean {
  const win = useOS.getState().windows.items.find((w) => w.id === id);
  return win?.status === "open" && pageVisible();
}

/**
 * Calls back only when isWindowVisible(id) changes, so a drag tick calls
 * nothing. Works outside React. Returns the unsubscribe.
 */
export function subscribeWindowVisible(
  id: string,
  cb: (visible: boolean) => void,
): () => void {
  let last = isWindowVisible(id);
  const check = (): void => {
    const next = isWindowVisible(id);
    if (next === last) return;
    last = next;
    cb(next);
  };
  const unsubscribe = useOS.subscribe(check);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", check);
  }
  return () => {
    unsubscribe();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", check);
    }
  };
}

const noop = (): void => {};
const serverSnapshot = (): boolean => false;

/**
 * For app components inside a window frame: false while the window is
 * minimised or the tab is hidden, so an app can pause its work.
 */
export function useWindowVisible(): boolean {
  const id = useContext(WindowIdContext);
  // Every hook runs before the throw, so the hook order never changes.
  const subscribe = useCallback(
    (onChange: () => void) =>
      id === null ? noop : subscribeWindowVisible(id, () => onChange()),
    [id],
  );
  const visible = useSyncExternalStore(
    subscribe,
    () => id !== null && isWindowVisible(id),
    serverSnapshot,
  );
  if (id === null)
    throw new Error("useWindowVisible must be used inside a window");
  return visible;
}
