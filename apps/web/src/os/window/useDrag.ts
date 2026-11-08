"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { frameThrottle, isPrimaryPress } from "../input/pointer";
import { useScreen } from "../screen/Screen";
import { os, useOS } from "../store";
import type { Point, WorkArea } from "../store/windows";

/** How much of the window must stay inside the work area. */
export const MIN_VISIBLE = 40;

/**
 * Keeps MIN_VISIBLE px of the window inside the work area on either side. The
 * top stops at the work area, so the handle can never go above it.
 */
export function clampToWorkArea(
  to: Point,
  width: number,
  area: WorkArea,
): Point {
  return {
    x: Math.min(
      Math.max(to.x, area.x + MIN_VISIBLE - width),
      area.x + area.w - MIN_VISIBLE,
    ),
    y: Math.min(Math.max(to.y, area.y), area.y + area.h - MIN_VISIBLE),
  };
}

export interface DragHandleProps {
  onPointerDown(e: PointerEvent<HTMLElement>): void;
  onPointerMove(e: PointerEvent<HTMLElement>): void;
  onPointerUp(e: PointerEvent<HTMLElement>): void;
  onPointerCancel(e: PointerEvent<HTMLElement>): void;
  onLostPointerCapture(e: PointerEvent<HTMLElement>): void;
  style: CSSProperties;
}

interface Session {
  pointerId: number;
  press: Point;
  start: Point;
  width: number;
  scale: number;
  area: WorkArea;
  last: Point;
}

interface Move {
  id: string;
  to: Point;
}

// From the press point, never by summing ticks, so the window lines up with
// the pointer again after the clamp has held it.
function target(s: Session, e: { clientX: number; clientY: number }): Point {
  return clampToWorkArea(
    {
      x: s.start.x + (e.clientX - s.press.x) / s.scale,
      y: s.start.y + (e.clientY - s.press.y) / s.scale,
    },
    s.width,
    s.area,
  );
}

/**
 * Drags a window by a handle, with mouse or touch, at any screen scale. The
 * caller spreads `handleProps` on the handle. Scale and work area are read at
 * the press and kept for that drag.
 */
export function useDrag(
  windowId: string,
  options?: { onDragEnd?(position: Point): void },
): { dragging: boolean; handleProps: DragHandleProps } {
  const { scale, workArea } = useScreen();
  const [dragging, setDragging] = useState(false);
  const session = useRef<Session | null>(null);
  const [write] = useState(() =>
    frameThrottle<Move>(({ id, to }) => os.windows.moveWindow(id, to)),
  );
  useEffect(() => () => write.cancel(), [write]);

  const onDragEnd = options?.onDragEnd;

  // pointerup carries the release point, and Chromium has delivered it before
  // the last queued pointermove, so a release moves the window there.
  // pointercancel and lostpointercapture keep the last move.
  const finish = (e: PointerEvent<HTMLElement>, release: boolean) => {
    const s = session.current;
    if (!s || s.pointerId !== e.pointerId) return;
    session.current = null;
    if (release) {
      const to = target(s, e);
      if (to.x !== s.last.x || to.y !== s.last.y) {
        s.last = to;
        write({ id: windowId, to });
      }
    }
    write.flush();
    setDragging(false);
    onDragEnd?.(s.last);
  };

  const handleProps: DragHandleProps = {
    onPointerDown(e) {
      if (!isPrimaryPress(e) || session.current) return;
      const win = useOS.getState().windows.items.find((w) => w.id === windowId);
      if (!win || win.maximized) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      session.current = {
        pointerId: e.pointerId,
        press: { x: e.clientX, y: e.clientY },
        start: win.position,
        width: win.size.width,
        scale,
        area: workArea,
        last: win.position,
      };
      setDragging(true);
    },
    onPointerMove(e) {
      const s = session.current;
      if (!s || s.pointerId !== e.pointerId) return;
      const to = target(s, e);
      s.last = to;
      write({ id: windowId, to });
    },
    onPointerUp: (e) => finish(e, true),
    onPointerCancel: (e) => finish(e, false),
    onLostPointerCapture: (e) => finish(e, false),
    style: { touchAction: "none", userSelect: "none" },
  };

  return { dragging, handleProps };
}
