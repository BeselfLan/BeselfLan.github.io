import { vi } from "vitest";

// Browser APIs that jsdom lacks. The fake observer fires only while something
// is observed, as a real one does.
export class FakeResizeObserver {
  static last: FakeResizeObserver;
  targets = new Set<Element>();
  observe = vi.fn((el: Element) => {
    this.targets.add(el);
  });
  disconnect = vi.fn(() => {
    this.targets.clear();
  });
  constructor(private cb: ResizeObserverCallback) {
    FakeResizeObserver.last = this;
  }
  trigger(width: number, height: number) {
    if (this.targets.size === 0) return;
    this.cb(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

export function stubMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  const matchMedia = vi.fn(() => query);
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    matchMedia,
    listeners,
    set(next: boolean) {
      query.matches = next;
      listeners.forEach((l) => l());
    },
  };
}
