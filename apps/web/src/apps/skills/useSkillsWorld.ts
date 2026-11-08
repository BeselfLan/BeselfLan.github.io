"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import type { AppApi } from "@/os/apps/types";
import { stageRect } from "./layout";
import { createStageLoop, transformFor, type StageLoop } from "./stageLoop";

// The Skills stage's physics world as a hook (plan 6.3, D13). It creates the
// loop of `stageLoop.ts` in a client layout effect, hands each icon's element
// to it by id, and disposes it on unmount. It holds no state: the loop writes
// the transforms straight to the elements, so React is never asked to render
// a frame.
//
// `loop.current` is null until the layout effect has run, so a pointer handler
// reads it at event time. The caller picks the radius (28, or 24 in fullscreen;
// #89). The hook uses neither `useScreen()` nor `useWindowVisible()`:
// registry.test.ts renders every app outside a Screen, and the loop follows
// visibility through the api, which a test can drive.

export interface SkillsWorldOptions {
  api: Pick<AppApi, "bounds" | "isVisible" | "subscribeVisible">;
  /** The skills on the stage, in order. A new list re-seeds the whole set. */
  ids: readonly string[];
  /** The icon radius, in screen units. */
  radius: number;
  /**
   * The stage's element. When it is given and the browser has a
   * `ResizeObserver`, the world follows the element's size, which covers
   * maximise and fullscreen. If the element is replaced while the hook stays
   * mounted (a list-view toggle), the hook watches the new one after the render
   * that replaced it.
   */
  stageRef?: RefObject<HTMLElement | null>;
}

export interface SkillsWorld {
  /**
   * A callback ref for the icon of `id`. The same function comes back for the
   * same id on every render, so React does not detach and attach an icon each
   * time the stage renders.
   */
  ref(id: string): (el: HTMLElement | null) => void;
  /** Null until the layout effect has run, and after unmount. */
  loop: RefObject<StageLoop | null>;
}

export function useSkillsWorld({
  api,
  ids,
  radius,
  stageRef,
}: SkillsWorldOptions): SkillsWorld {
  const loop = useRef<StageLoop | null>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());

  const ref = useCallback((id: string) => {
    let cb = callbacks.current.get(id);
    if (!cb) {
      cb = (el) => {
        if (!el) {
          elements.current.delete(id);
          return;
        }
        elements.current.set(id, el);
        // An icon that mounts late gets its place at once, even while the loop
        // is stopped, so it never sits at 0,0.
        const body = loop.current?.bodies().find((b) => b.id === id);
        if (body) el.style.transform = transformFor(body);
      };
      callbacks.current.set(id, cb);
    }
    return cb;
  }, []);

  // Kebab-case ids hold no comma, so the joined list is a stable key.
  const key = ids.join(",");
  const idList = useMemo(() => (key === "" ? [] : key.split(",")), [key]);

  // A layout effect, so the first transforms are written before the first
  // paint and no icon shows a frame at 0,0. It runs on the client only, so the
  // seed is drawn here and never at import or in render (plan 9, hydration).
  useLayoutEffect(() => {
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const created = createStageLoop({
      bounds: stageRect(api.bounds()),
      seed,
      // Arrow wrappers read the globals and the api at call time, so a test
      // that installs fakes before `render` sees them.
      clock: {
        now: () => performance.now(),
        request: (cb) => requestAnimationFrame(cb),
        cancel: (handle) => cancelAnimationFrame(handle),
      },
      visibility: {
        isVisible: () => api.isVisible(),
        subscribe: (cb) => api.subscribeVisible(cb),
      },
      write: (id, transform) => {
        const el = elements.current.get(id);
        if (el) el.style.transform = transform;
      },
    });
    loop.current = created;
    return () => {
      created.dispose();
      loop.current = null;
    };
  }, [api]);

  // `api` is a dependency so that a loop rebuilt for a new api is refilled.
  useLayoutEffect(() => {
    loop.current?.setBodies(idList, radius);
  }, [api, idList, radius]);

  // The stage's size. A ref object does not change when its element is
  // replaced (a list-view toggle remounts the stage while this hook stays
  // mounted), so this effect has no dependency list: after every render it
  // compares the element and the api with what it watches, and starts over when
  // either differs. A new observer reports the size as soon as it starts, which
  // is how a loop rebuilt for a new api, or the new element, gets the stage's
  // size and not just `stageRect(api.bounds())`.
  const watching = useRef<{
    el: HTMLElement;
    api: SkillsWorldOptions["api"];
    observer: ResizeObserver;
  } | null>(null);
  useEffect(() => {
    const el = stageRef?.current ?? null;
    const now = watching.current;
    if (now && now.el === el && now.api === api) return;
    now?.observer.disconnect();
    watching.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      // Screen units: the screen's scale is a transform, which the layout
      // sizes do not include. A zero or NaN size is skipped.
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      if (width > 0 && height > 0) {
        loop.current?.setBounds({ x: 0, y: 0, width, height });
      }
    });
    observer.observe(el);
    watching.current = { el, api, observer };
  });
  useEffect(
    () => () => {
      watching.current?.observer.disconnect();
      watching.current = null;
    },
    [],
  );

  return { ref, loop };
}
