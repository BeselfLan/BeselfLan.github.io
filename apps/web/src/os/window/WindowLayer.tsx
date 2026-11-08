"use client";

import { AnimatePresence, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useOS } from "../store";
import { WindowFrame, type WindowChrome } from "./WindowFrame";
import { REDUCED_MOTION } from "./windowMotion";

export { FALLBACK_CHROME, type WindowChrome } from "./WindowFrame";

/** The CSS maximum, so above every frame (see ON_TOP_Z). */
export const ABOVE_WINDOWS = 2 ** 31 - 1;

export interface WindowLayerProps {
  /** Keep it stable (module level or memoised), or every frame re-renders with the layer. */
  chromeOf(appId: string): WindowChrome | undefined;
  /** Keep it stable, for the same reason. */
  renderContent(windowId: string): ReactNode;
  /** Drawn above every window. */
  children?: ReactNode;
}

/**
 * Holds one frame per window, minimised ones included. It does not take the
 * pointer, so the desktop under it stays reachable; the frames do. A closed
 * window's frame stays until its fade ends. `settings.reducedMotion` drives
 * the MotionConfig, so motion inside the windows follows it too.
 */
export function WindowLayer({
  chromeOf,
  renderContent,
  children,
}: WindowLayerProps) {
  // Ids in items order, not orderedWindows: a raise must not move a DOM node
  // between pointer events, and a drag tick changes no id. Stacking is zIndex.
  const ids = useOS(useShallow((s) => s.windows.items.map((w) => w.id)));
  // A frame is one window of one opening, so an id reopened during its old
  // frame's fade gets a new frame and the old app still unmounts.
  const opened = useOS(
    useShallow((s) => s.windows.items.map((w) => w.openedAt)),
  );
  const reducedMotion = useOS((s) => s.settings.reducedMotion);
  return (
    <MotionConfig reducedMotion={REDUCED_MOTION[reducedMotion]}>
      <div
        data-window-layer=""
        className="pointer-events-none absolute inset-0 isolate"
      >
        {/* presenceAffectsLayout is off because windows are absolutely
            positioned and nothing reflows when one leaves. On, every frame
            re-renders whenever the layer does. */}
        <AnimatePresence presenceAffectsLayout={false}>
          {ids.map((id, i) => (
            <WindowFrame
              key={`${id}:${opened[i]}`}
              id={id}
              openedAt={opened[i]}
              chromeOf={chromeOf}
              renderContent={renderContent}
            />
          ))}
        </AnimatePresence>
        {children !== undefined && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ zIndex: ABOVE_WINDOWS }}
          >
            {children}
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
