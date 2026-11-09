import { useOS } from "../store";
import type { Notification } from "../store/notifications";

// The toasts' timing and stacking (plan 4.6, #101), as plain code with no
// React: a test drives it with fake timers, and Strict Mode's start, stop,
// start is handled in one place. The component reads it through
// useSyncExternalStore.
//
// A toast is local state. It never calls `os.notifications.dismiss`, so a toast
// that times out, or is hidden with its button, stays in the calendar's list.
// The other way round, an item that leaves the store takes its toast with it.

/** How long a toast stays, from when it appeared. */
export const TOAST_MS = 4000;
/** At most this many show at once. */
export const MAX_TOASTS = 3;

export interface Toast {
  id: string;
  title: string;
  body?: string;
  /** `Date.now()` when it leaves. */
  until: number;
}

export interface ToastQueue {
  subscribe(cb: () => void): () => void;
  /** Newest first. A new array on every change, so it works as a snapshot. */
  get(): readonly Toast[];
  /** Subscribes to the store and arms the timers. Returns the stop. */
  start(): () => void;
  /** Removes the toast only. The notification stays in the store. */
  hide(id: string): void;
}

/**
 * `seen` holds the ids that were in the store when the component first
 * rendered. They never toast, so a desktop that remounts (Restart) does not
 * replay old notifications.
 *
 * `icon` is never copied: the toast does not draw it, so it cannot ask for a
 * file that is missing.
 */
export function createToastQueue(seen: Iterable<string>): ToastQueue {
  const known = new Set(seen);
  const listeners = new Set<() => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let toasts: readonly Toast[] = [];

  function set(next: readonly Toast[]): void {
    toasts = next;
    for (const listener of [...listeners]) listener();
  }

  function disarm(id: string): void {
    clearTimeout(timers.get(id));
    timers.delete(id);
  }

  // Each toast has its own timer, counted from when it appeared.
  function arm(toast: Toast): void {
    disarm(toast.id);
    timers.set(
      toast.id,
      setTimeout(() => remove(toast.id), Math.max(0, toast.until - Date.now())),
    );
  }

  function remove(id: string): void {
    disarm(id);
    if (toasts.some((t) => t.id === id)) {
      set(toasts.filter((t) => t.id !== id));
    }
  }

  function show(n: Notification): void {
    known.add(n.id);
    const toast: Toast = {
      id: n.id,
      title: n.title,
      ...(n.body === undefined ? {} : { body: n.body }),
      until: Date.now() + TOAST_MS,
    };
    // The fourth drops the oldest shown, at once. There is no queue.
    const next = [toast, ...toasts];
    for (const dropped of next.slice(MAX_TOASTS)) disarm(dropped.id);
    arm(toast);
    set(next.slice(0, MAX_TOASTS));
  }

  // Shows what is new in the store and drops what has left it. The items are
  // oldest first, so the newest ends on top.
  function sync(): void {
    const items = useOS.getState().notifications.items;
    for (const n of items) {
      if (!known.has(n.id)) show(n);
    }
    const present = new Set(items.map((n) => n.id));
    const gone = toasts.filter((t) => !present.has(t.id));
    if (gone.length > 0) {
      for (const t of gone) disarm(t.id);
      set(toasts.filter((t) => present.has(t.id)));
    }
  }

  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    get: () => toasts,
    start() {
      // First, what was pushed between the render and now, by an effect that
      // ran before this one. Then the timers of every toast already shown, so
      // that after Strict Mode's stop and start a toast still leaves on time.
      sync();
      for (const t of toasts) arm(t);
      let last = useOS.getState().notifications.items;
      const unsubscribe = useOS.subscribe((state) => {
        // Immer shares the array while nothing in it changed.
        if (state.notifications.items === last) return;
        last = state.notifications.items;
        sync();
      });
      return () => {
        unsubscribe();
        for (const id of [...timers.keys()]) disarm(id);
      };
    },
    hide: remove,
  };
}
