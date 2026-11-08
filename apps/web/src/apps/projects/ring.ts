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
  wheelToRotation,
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
//
// The input (#95) is bound here too, on the stage element that `attach` takes:
// the wheel, the keys and the pointer. Every listener is added in `attach` and
// removed by its detach, so there is one place to read and Strict Mode (attach,
// detach, attach) leaves none behind. The component stays a view.

export interface Ring {
  /**
   * Takes the ring's element and the stage that holds it, paints the first
   * pose and binds the input on the stage. Returns the detach, which removes
   * the listeners, ends any wheel run or press, cancels the pending frame and
   * lets go of both elements. It keeps the motion, so Strict Mode (attach,
   * detach, attach) is safe.
   */
  attach(ringEl: HTMLElement, stageEl: HTMLElement): () => void;
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
  let wheelTimer: ReturnType<typeof setTimeout> | null = null;
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

  function clearWheel() {
    if (wheelTimer !== null) clearTimeout(wheelTimer);
    wheelTimer = null;
  }

  function go(target: number) {
    // A button, a click or a key during a wheel run wins: the idle snap must
    // not retarget the spring 120 ms later.
    clearWheel();
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

  /**
   * Ends the wheel run. A turn that is still held (mode `drag`) becomes a
   * spring to the nearest item at speed 0, so pause jumps it to that item and
   * a detach leaves a re-attach to finish it.
   */
  function stopInput() {
    clearWheel();
    if (m.mode === "drag") {
      m = {
        rot: m.rot,
        omega: 0,
        mode: "spring",
        target: snapRotation(m.rot, n),
      };
    }
  }

  // The wheel turns the ring directly and snaps once it has been quiet for
  // `wheelIdleMs`. This listener is native and not passive, because React's
  // `onWheel` is passive and cannot cancel the event.
  function onWheel(e: WheelEvent) {
    // Ctrl+wheel and the trackpad pinch zoom the page (WCAG 1.4.4).
    if (e.ctrlKey) return;
    // Stop a wheel over the ring from scrolling a parent or from starting a
    // swipe navigation, even when it does not turn the ring.
    e.preventDefault();
    if (paused) return;
    m = { ...m, rot: m.rot + wheelToRotation(e), omega: 0, mode: "drag" };
    request();
    clearWheel();
    wheelTimer = setTimeout(() => {
      wheelTimer = null;
      go(snapRotation(m.rot, n));
    }, CAROUSEL.wheelIdleMs);
  }

  // Keys are heard on the stage, as they bubble up from the focused item, and
  // not on the window: a key typed in the chips or in #18's panel must not turn
  // the ring. Focus follows the key to the item it sends the ring to, which is
  // known at once, so it does not walk through every item a spring passes.
  function onKeyDown(e: KeyboardEvent) {
    // Alt+Arrow is the browser's back and forward. Shift is not checked.
    if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    if (n < 2) return;
    const from = m.mode === "spring" ? m.target : m.rot;
    let to: number;
    switch (e.key) {
      case "ArrowRight":
        to = stepTarget(m, 1, n);
        break;
      case "ArrowLeft":
        to = stepTarget(m, -1, n);
        break;
      case "Home":
        to = rotationForIndex(0, from, n);
        break;
      case "End":
        to = rotationForIndex(n - 1, from, n);
        break;
      default:
        return;
    }
    go(to);
    // The window's content box is overflow: hidden, and a plain focus() can
    // still scroll it.
    items[frontIndex(to, n)]?.focus({ preventScroll: true });
    e.preventDefault();
  }

  return {
    attach(el, stage) {
      ringEl = el;
      const off: (() => void)[] = [];
      const on = <K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (e: HTMLElementEventMap[K]) => void,
        options?: AddEventListenerOptions,
      ) => {
        stage.addEventListener(type, listener, options);
        off.push(() => stage.removeEventListener(type, listener, options));
      };
      on("wheel", onWheel, { passive: false });
      on("keydown", onKeyDown);
      paint();
      if (moving(m) && !paused) request();
      return () => {
        for (const remove of off) remove();
        stopInput();
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
      stopInput();
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
