import {
  CAROUSEL,
  REST,
  frontIndex,
  itemPose,
  ringTransform,
  rotationForIndex,
  snapRotation,
  springTo,
  stepMotion,
  stepTarget,
  type Motion,
} from "./carousel.math";

// The controller of the Projects ring (plan 5.3, D8, D13). It holds everything
// that changes per frame: the motion, the pending frame, the elements, and the
// index of the front item. `Carousel.tsx` holds it in `useState` and reads the
// front index through `useSyncExternalStore`. The index lives here, and not in
// a `useState` of the component, because the React Compiler's
// `set-state-in-effect` rule fails a pause effect that reaches a setter
// through a local function. A store with `subscribe` has no setter to reach.
//
// `carousel.math.ts` stays pure; this file is where the DOM, the clock and the
// timers are. There is no React in it, so a node test could drive it.
//
// The loop writes the ring's `transform` and each item's `transform`, `opacity`
// and `z-index` straight to the elements, so the component never sets them
// and a re-render cannot undo them. The loop runs only while the motion is a
// spring or inertia, and it never sets React state: the one thing React hears
// is a change of the front index.

export interface Ring {
  /**
   * Takes the ring's element and paints the first pose. Returns the detach,
   * which cancels the pending frame and lets go of the element, but keeps the
   * motion, so Strict Mode (attach, detach, attach) is safe. #95 adds the
   * stage element here.
   */
  attach(ringEl: HTMLElement): () => void;
  /** Called from each item's callback ref, with `null` when it unmounts. */
  setItem(index: number, el: HTMLElement | null): void;
  /** While true every move jumps to its target (plan 8.2). */
  setReduced(reduced: boolean): void;
  /**
   * D13. True stops the loop and jumps to where the ring was going (a spring
   * to its target, anything else to the nearest item), and while true every
   * move jumps. False changes nothing else.
   */
  setPaused(paused: boolean): void;
  /** A positive delta is the next item. Does nothing for fewer than two. */
  step(delta: number): void;
  /** Turns the shortest way to `index`. Does nothing when already there. */
  show(index: number): void;
  /** For `useSyncExternalStore`. Closures, so they can be passed bare. */
  subscribe(listener: () => void): () => void;
  /** The front index, the store's snapshot. */
  front(): number;
}

const moving = (m: Motion): boolean =>
  m.mode === "spring" || m.mode === "inertia";

/** A ring of `n` items with item `initialIndex` at the front, at rest. */
export function createRing(n: number, initialIndex: number): Ring {
  const start = rotationForIndex(initialIndex, 0, n);
  let m: Motion = { ...REST, rot: start, target: start };
  let shown = initialIndex;
  const listeners = new Set<() => void>();
  const items: (HTMLElement | null)[] = [];
  let ringEl: HTMLElement | null = null;
  let frame: number | null = null;
  let last: number | null = null;
  let reduced = false;
  let paused = false;

  function paint() {
    if (ringEl) ringEl.style.transform = ringTransform(m.rot, n);
    for (let i = 0; i < n; i++) {
      const el = items[i];
      if (!el) continue;
      const pose = itemPose(i, n, m.rot);
      el.style.transform = pose.transform;
      el.style.opacity = String(pose.opacity);
      el.style.zIndex = String(pose.zIndex);
    }
    const f = frontIndex(m.rot, n);
    if (f !== shown) {
      shown = f;
      for (const listener of [...listeners]) listener();
    }
  }

  function cancel() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    last = null;
  }

  function tick(ts: number) {
    frame = null;
    // A run's first frame steps 1/60 s: Chromium's timestamp is the frame's
    // start, which can be earlier than the click that began the run.
    const dt = last === null ? 1 / 60 : (ts - last) / 1000;
    last = ts;
    m = stepMotion(m, dt, n);
    paint();
    if (moving(m)) frame = requestAnimationFrame(tick);
    else last = null;
  }

  function request() {
    if (frame === null && ringEl !== null) frame = requestAnimationFrame(tick);
  }

  function go(target: number) {
    // A click on the front item, or a step that lands where the ring is.
    if (m.mode === "idle" && Math.abs(m.rot - target) < CAROUSEL.settleDeg) {
      return;
    }
    m = springTo(m, target, reduced || paused);
    if (m.mode === "idle") {
      cancel();
      paint();
    } else {
      request();
    }
  }

  return {
    attach(el) {
      ringEl = el;
      paint();
      if (moving(m) && !paused) request();
      return () => {
        cancel();
        ringEl = null;
      };
    },
    setItem(index, el) {
      items[index] = el;
    },
    setReduced(r) {
      reduced = r;
    },
    setPaused(p) {
      paused = p;
      if (!p) return;
      cancel();
      const to = m.mode === "spring" ? m.target : snapRotation(m.rot, n);
      m = { rot: to, omega: 0, mode: "idle", target: to };
      paint();
    },
    step(delta) {
      if (n < 2) return;
      go(stepTarget(m, delta, n));
    },
    show(index) {
      go(rotationForIndex(index, m.mode === "spring" ? m.target : m.rot, n));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    front() {
      return shown;
    },
  };
}
