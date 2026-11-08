"use client";

import type { Entry } from "@beself/content";
import { useReducedMotionConfig } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/os/ui/Button";
import { Icon } from "@/os/ui/Icon";
import { CAROUSEL } from "./carousel.math";
import "./carousel.css";
import { ProjectItem } from "./ProjectItem";
import { createRing } from "./ring";

// The Projects entries on a 3D ring (plan 5.3, D8, Appendix C.1). The motion
// is `ring.ts`'s: its loop owns the items' `transform`, `opacity` and `z-index`
// and the ring's `transform`, so the JSX below never sets them (a `style` here
// would be rewritten by every render and undo the loop). React hears only the
// front index, through `useSyncExternalStore`.
//
// This file does not use `useScreen()`, so `registry.test.ts` can render it
// outside a Screen. Reduced motion comes from `useReducedMotionConfig()`:
// outside any `MotionConfig` it is false. The arrow keys, the wheel and the
// drag are `ring.ts`'s, bound on the stage when the ring attaches, so the JSX
// has no handler for them. The detail panel is #18's.

export interface CarouselProps {
  /**
   * The entries, in ring order. Their number is read once, when the ring is
   * made, so the parent keys the carousel by its list. `ProjectsApp` does.
   */
  items: readonly Entry[];
  /** The front item on mount, placed without animation. The first item when absent or not in `items`. */
  initialFrontId?: string | null;
  selectedId: string | null;
  /** A click on any item, or Enter or Space on the front one. A non-front item also turns to the front. */
  onSelect(id: string): void;
  /** While true the loop stops and the ring sits at its target (D13). */
  paused: boolean;
  /** Screen units the stage moves right, over 250 ms (at once under reduced motion). #18 sets it while its panel is open. */
  offsetX?: number;
}

export function Carousel(props: CarouselProps) {
  if (props.items.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-sm opacity-70">
        Nothing here yet.
      </p>
    );
  }
  return <CarouselRing {...props} />;
}

function CarouselRing({
  items,
  initialFrontId,
  selectedId,
  onSelect,
  paused,
  offsetX,
}: CarouselProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const [ring] = useState(() =>
    createRing(
      items.length,
      Math.max(
        0,
        items.findIndex((e) => e.id === initialFrontId),
      ),
    ),
  );
  const front = useSyncExternalStore(ring.subscribe, ring.front, ring.front);
  const ringEl = useRef<HTMLDivElement>(null);
  const stageEl = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => ring.setReduced(reduced), [ring, reduced]);
  // In a layout effect, so the first pose is on screen before the first paint.
  useLayoutEffect(() => {
    const el = ringEl.current;
    const stage = stageEl.current;
    return el && stage ? ring.attach(el, stage) : undefined;
  }, [ring]);
  useEffect(() => ring.setPaused(paused), [ring, paused]);

  const one = items.length < 2;

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label="Projects"
      className="flex h-full flex-col"
    >
      <div
        data-carousel=""
        ref={stageEl}
        className="projects-stage"
        style={{
          perspective: CAROUSEL.perspective,
          transform: `translateX(${offsetX ?? 0}px)`,
          transition: reduced ? "none" : undefined,
        }}
      >
        <div data-carousel-ring="" ref={ringEl} className="projects-ring">
          {items.map((e, i) => (
            <ProjectItem
              key={e.id}
              ref={(el) => ring.setItem(i, el)}
              entry={e}
              className="projects-item"
              front={i === front}
              tabIndex={i === front ? 0 : -1}
              selected={e.id === selectedId}
              onClick={() => {
                ring.show(i);
                onSelect(e.id);
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3 py-2">
        <Button
          variant="ghost"
          aria-label="Previous item"
          disabled={one}
          onClick={() => ring.step(-1)}
        >
          <Icon>
            <path d="m15 18-6-6 6-6" />
          </Icon>
        </Button>
        <p
          data-carousel-index=""
          aria-live="polite"
          aria-atomic="true"
          className="min-w-16 text-center text-xs tabular-nums opacity-70"
        >
          {`${front + 1} / ${items.length}`}
          <span className="sr-only">{`, ${items[front]?.title ?? ""}`}</span>
        </p>
        <Button
          variant="ghost"
          aria-label="Next item"
          disabled={one}
          onClick={() => ring.step(1)}
        >
          <Icon>
            <path d="m9 18 6-6-6-6" />
          </Icon>
        </Button>
      </div>
    </div>
  );
}
