"use client";

import type { Skill } from "@beself/content";
import { useReducedMotionConfig } from "motion/react";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { isPrimaryPress } from "@/os/input/pointer";
import {
  createVelocityTracker,
  isClick,
  measureScale,
  stagePoint,
} from "./interaction";
import { FADE_MS, HOVER_SCALE } from "./layout";
import type { Vec } from "./physics/body";
import { SkillIcon } from "./SkillIcon";
import { useSkillsWorld, type SkillsWorldOptions } from "./useSkillsWorld";

// The floating stage (plan 6.3, 6.4, C.2): one button per skill, each moved
// every frame by the loop of stageLoop.ts through useSkillsWorld. The loop
// writes `transform` straight to the elements, so this component sets none in
// its JSX and is never rendered for a frame: it renders on a focus, a
// selection or a new set of skills only.
//
// Pointer: a press that stays under 4 units and 250 ms is a click and selects
// the skill; anything else drags the icon and a release flicks it. Selection
// happens only in `onClick`, so a pointer click and a keyboard Enter or Space
// share one path. The arrows, Home and End move the focus between the icons,
// and the tab stop roves. It uses neither `useScreen()` nor the Tooltip: both
// throw outside a Screen, where registry.test.ts renders every app.

export interface SkillsStageProps {
  skills: readonly Skill[];
  selectedId: string | null;
  onSelect(id: string): void;
  api: SkillsWorldOptions["api"];
  /** The icon radius, in screen units. */
  radius: number;
}

// A press in progress. The stage's rectangle and the screen's scale are
// measured once, at pointer down: the window cannot move or scale while a
// button is held on one of its icons.
interface Press {
  id: string;
  pointerId: number;
  start: Vec;
  at: number;
  /** The largest distance from `start` so far, in stage units. */
  travel: number;
  rect: { left: number; top: number };
  scale: number;
}

// The time of a handler, in ms. A plain function outside the component: it is
// only ever called from event handlers, and the purity lint cannot tell that
// from a call in render when `performance.now()` is written inside the
// component. Tests fake `performance`, so it is read through the global.
const now = () => performance.now();

const FORWARD = new Set(["ArrowRight", "ArrowDown"]);
const BACK = new Set(["ArrowLeft", "ArrowUp"]);

export function SkillsStage({
  skills,
  selectedId,
  onSelect,
  api,
  radius,
}: SkillsStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const ids = useMemo(() => skills.map((s) => s.id), [skills]);
  const world = useSkillsWorld({ api, ids, radius, stageRef });
  const reduced = useReducedMotionConfig() ?? false;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [tracker] = useState(createVelocityTracker);
  // Written only in handlers, never in render.
  const press = useRef<Press | null>(null);
  const suppressed = useRef<string | null>(null);

  // The roving tab stop: the icon that was focused last, if it is still on the
  // stage, else the selected one, else the first.
  const on = (id: string | null) =>
    id !== null && skills.some((s) => s.id === id);
  const tabStop = on(focusId)
    ? focusId
    : on(selectedId)
      ? selectedId
      : (skills[0]?.id ?? null);

  function down(e: PointerEvent<HTMLButtonElement>, id: string) {
    suppressed.current = null;
    if (!isPrimaryPress(e)) return;
    const stage = stageRef.current;
    const loop = world.loop.current;
    if (!stage || !loop) return;
    const rect = stage.getBoundingClientRect();
    const scale = measureScale(rect.width, stage.offsetWidth);
    const p = stagePoint(e.clientX, e.clientY, rect, scale);
    // jsdom has no pointer capture.
    if (typeof e.currentTarget.setPointerCapture === "function") {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const at = now();
    tracker.reset();
    tracker.push(at, p.x, p.y);
    loop.grab(id, p);
    press.current = {
      id,
      pointerId: e.pointerId,
      start: p,
      at,
      travel: 0,
      rect: { left: rect.left, top: rect.top },
      scale,
    };
  }

  function move(e: PointerEvent<HTMLButtonElement>) {
    const held = press.current;
    if (!held || e.pointerId !== held.pointerId) return;
    const p = stagePoint(e.clientX, e.clientY, held.rect, held.scale);
    held.travel = Math.max(
      held.travel,
      Math.hypot(p.x - held.start.x, p.y - held.start.y),
    );
    tracker.push(now(), p.x, p.y);
    world.loop.current?.moveGrab(held.id, p);
  }

  function up(e: PointerEvent<HTMLButtonElement>) {
    const held = press.current;
    if (!held || e.pointerId !== held.pointerId) return;
    press.current = null;
    const at = now();
    if (isClick(held.travel, at - held.at)) {
      // The `click` event that follows selects the icon.
      world.loop.current?.release(held.id, { x: 0, y: 0 });
    } else {
      world.loop.current?.release(held.id, tracker.velocity(at));
      suppressed.current = held.id;
    }
  }

  function cancel(e: PointerEvent<HTMLButtonElement>) {
    const held = press.current;
    if (!held || e.pointerId !== held.pointerId) return;
    press.current = null;
    world.loop.current?.release(held.id, { x: 0, y: 0 });
    suppressed.current = held.id;
  }

  function click(id: string) {
    if (suppressed.current === id) {
      suppressed.current = null;
      return;
    }
    onSelect(id);
  }

  function keys(e: KeyboardEvent<HTMLDivElement>) {
    // A stale flag must never eat a keyboard Enter.
    suppressed.current = null;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const buttons = [
      ...e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-skill-id]"),
    ];
    const i = buttons.findIndex((b) => b === e.target);
    if (i < 0) return;
    const n = buttons.length;
    let next: number;
    if (FORWARD.has(e.key)) next = (i + 1) % n;
    else if (BACK.has(e.key)) next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else return;
    e.preventDefault();
    // The button's onFocus moves the tab stop.
    buttons[next].focus({ preventScroll: true });
  }

  return (
    <div
      ref={stageRef}
      data-skills-stage=""
      className="skills-stage relative min-h-0 flex-1 overflow-hidden"
      style={
        {
          "--skills-hover-scale": HOVER_SCALE,
          "--skills-fade-ms": `${FADE_MS}ms`,
        } as CSSProperties
      }
      onKeyDown={keys}
    >
      {/* Keyed by the set, so a tab switch remounts it and the new icons fade
          in together (the loop re-seeds all of them). */}
      <div
        key={ids.join(",")}
        className={reduced ? "skills-set" : "skills-set skills-set-enter"}
      >
        {skills.map((s) => (
          <button
            key={s.id}
            ref={world.ref(s.id)}
            type="button"
            data-skill-id={s.id}
            data-selected={s.id === selectedId ? "" : undefined}
            tabIndex={s.id === tabStop ? 0 : -1}
            className="skills-icon"
            // The loop owns `transform`: only the size goes here.
            style={{ width: 2 * radius, height: 2 * radius }}
            onPointerDown={(e) => down(e, s.id)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={cancel}
            onClick={() => click(s.id)}
            onFocus={() => setFocusId(s.id)}
          >
            <span className="skills-face">
              <SkillIcon skill={s} size={2 * radius} />
            </span>
            <span className="skills-label">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
