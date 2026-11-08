import { isPrimaryPress } from "@/os/input/pointer";
import {
  CAROUSEL,
  REST,
  dragToRotation,
  frontIndex,
  itemPose,
  release,
  releaseOmega,
  ringTransform,
  rotationForIndex,
  snapRotation,
  springTo,
  stepMotion,
  stepTarget,
  wheelToRotation,
  type Motion,
  type Sample,
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

/** A pointer that is down on the stage. */
interface Press {
  id: number;
  /** Where it went down, in client px. */
  x: number;
  y: number;
  /** The ring's rotation at the press. */
  start: number;
  /** Client px per screen unit, read from the DOM at the press. */
  scale: number;
  /** True once it has travelled `CAROUSEL.dragThreshold` screen units. */
  dragging: boolean;
  /** The last `releaseWindowMs` of the drag, for the speed at release. */
  samples: Sample[];
}

/** A ring of `n` items with item `initialIndex` at the front, at rest. */
export function createRing(n: number, initialIndex: number): Ring {
  const start = rotationForIndex(initialIndex, 0, n);
  let m: Motion = { ...REST, rot: start, target: start };
  let shown = initialIndex;
  const listeners = new Set<() => void>();
  const items: (HTMLElement | null)[] = [];
  let ringEl: HTMLElement | null = null;
  let stageEl: HTMLElement | null = null;
  let press: Press | null = null;
  // True from the end of a drag until the click that follows it is swallowed.
  let swallow = false;
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
   * Ends the wheel run and any press, for a pause and for a detach. A turn
   * that is still held (mode `drag`) becomes a spring to the nearest item at
   * speed 0, so pause jumps it to that item and a detach leaves a re-attach to
   * finish it.
   */
  function stopInput() {
    clearWheel();
    if (press) {
      const id = press.id;
      press = null;
      if (stageEl?.hasPointerCapture(id)) stageEl.releasePointerCapture(id);
    }
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
    if (paused || press) return;
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
    // Enter on the front item after a drag clicks with no pointerdown before it.
    swallow = false;
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

  // A drag follows the pointer from where it went down: the rotation is the
  // start plus the distance from the press, divided by the screen's scale, and
  // never a sum of per-move steps. Chromium coalesces moves, so nothing here
  // counts them. It starts after `dragThreshold` screen units, and only then
  // does the stage take pointer capture: capturing at the press would send
  // every item click to the stage in Chromium.
  function onPointerDown(e: PointerEvent) {
    swallow = false;
    if (!stageEl || !isPrimaryPress(e) || paused || press) return;
    clearWheel();
    // The scale is the DOM's, not `useScreen()`'s, so the ring also works
    // outside a Screen. The stage's own translateX does not change its width.
    const width = stageEl.offsetWidth;
    const measured =
      width > 0 ? stageEl.getBoundingClientRect().width / width : 1;
    const scale = Number.isFinite(measured) && measured > 0 ? measured : 1;
    // A press stops a turning ring, the way a hand stops a wheel.
    cancel();
    m = { rot: m.rot, omega: 0, mode: "drag", target: m.rot };
    press = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      start: m.rot,
      scale,
      dragging: false,
      samples: [{ t: performance.now(), rot: m.rot }],
    };
  }

  function sample(p: Press) {
    const t = performance.now();
    p.samples.push({ t, rot: m.rot });
    // Older samples are outside the release window already.
    while (p.samples[0].t < t - CAROUSEL.releaseWindowMs) p.samples.shift();
  }

  function onPointerMove(e: PointerEvent) {
    const p = press;
    if (!p || e.pointerId !== p.id || !stageEl) return;
    const dx = e.clientX - p.x;
    if (!p.dragging) {
      const travel = Math.hypot(dx, e.clientY - p.y) / p.scale;
      if (travel < CAROUSEL.dragThreshold) return;
      p.dragging = true;
      // Only from a live move of the press's own pointer: for any other id
      // setPointerCapture throws.
      stageEl.setPointerCapture(p.id);
    }
    m = { ...m, mode: "drag", rot: p.start + dragToRotation(dx, p.scale) };
    sample(p);
    request();
  }

  /** Lets go of the ring at `omega` deg/s and ends the press. */
  function letGo(omega: number) {
    press = null;
    const snap = snapRotation(m.rot, n);
    if (omega === 0 && Math.abs(m.rot - snap) < CAROUSEL.settleDeg) {
      // A press that never became a drag, on an item: nothing to animate.
      cancel();
      m = { rot: snap, omega: 0, mode: "idle", target: snap };
      paint();
      return;
    }
    m = release(m, omega, n, reduced || paused);
    if (m.mode === "idle") {
      cancel();
      paint();
    } else {
      request();
    }
  }

  function onPointerUp(e: PointerEvent) {
    const p = press;
    if (!p || e.pointerId !== p.id) return;
    let omega = 0;
    if (p.dragging) {
      // The sample at the release matters: a flick can bring a single move.
      m = { ...m, rot: p.start + dragToRotation(e.clientX - p.x, p.scale) };
      sample(p);
      omega = releaseOmega(p.samples, performance.now());
      swallow = true;
    }
    letGo(omega);
  }

  // A cancelled press, a lost capture and a pointer that leaves before the
  // threshold let go at rest and swallow no click. Before capture a pointerup
  // outside the stage never reaches it, and a stuck press would freeze the ring.
  function onPointerCancel(e: PointerEvent) {
    if (press && e.pointerId === press.id) letGo(0);
  }

  function onLostPointerCapture(e: PointerEvent) {
    // On touch the item holds implicit capture, and its lostpointercapture
    // bubbles up when the stage takes over at the threshold.
    if (e.target === stageEl) onPointerCancel(e);
  }

  function onPointerLeave(e: PointerEvent) {
    if (press && !press.dragging) onPointerCancel(e);
  }

  // The click that ends a drag must not select the item under the pointer.
  function onClickCapture(e: MouseEvent) {
    if (!swallow) return;
    swallow = false;
    e.preventDefault();
    e.stopPropagation();
  }

  // The icon image would start a native drag, which cancels the pointer stream.
  function onDragStart(e: DragEvent) {
    e.preventDefault();
  }

  return {
    attach(el, stage) {
      ringEl = el;
      stageEl = stage;
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
      on("pointerdown", onPointerDown);
      on("pointermove", onPointerMove);
      on("pointerup", onPointerUp);
      on("pointercancel", onPointerCancel);
      on("lostpointercapture", onLostPointerCapture);
      on("pointerleave", onPointerLeave);
      on("click", onClickCapture, { capture: true });
      on("dragstart", onDragStart);
      paint();
      if (moving(m) && !paused) request();
      return () => {
        for (const remove of off) remove();
        stopInput();
        cancel();
        ringEl = null;
        stageEl = null;
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
