"use client";

import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useOS } from "../store";
import { WindowFrame, type WindowChrome } from "./WindowFrame";

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
 * pointer, so the desktop under it stays reachable; the frames do.
 */
export function WindowLayer({
  chromeOf,
  renderContent,
  children,
}: WindowLayerProps) {
  // Ids in items order, not orderedWindows: a raise must not move a DOM node
  // between pointer events, and a drag tick changes no id. Stacking is zIndex.
  const ids = useOS(useShallow((s) => s.windows.items.map((w) => w.id)));
  return (
    <div
      data-window-layer=""
      className="pointer-events-none absolute inset-0 isolate"
    >
      {ids.map((id) => (
        <WindowFrame
          key={id}
          id={id}
          chromeOf={chromeOf}
          renderContent={renderContent}
        />
      ))}
      {children !== undefined && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ zIndex: ABOVE_WINDOWS }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
