"use client";

import { motion, useIsPresent, useReducedMotionConfig } from "motion/react";
import { memo, useId, useState, type ReactNode } from "react";
import { useScreen } from "../screen/Screen";
import { focusedWindow, os, useOS, type OSState } from "../store";
import type { WindowState } from "../store/windows";
import { getIconRect } from "./iconRect";
import { TitleBar } from "./TitleBar";
import { useDrag } from "./useDrag";
import { WindowIdContext } from "./useWindowVisible";
import {
  flyTo,
  surfaceVariants,
  toScreenRect,
  type SurfaceCustom,
} from "./windowMotion";

/** What a frame needs from an app: the capabilities and `window.chrome`. */
export interface WindowChrome {
  minimize: boolean;
  maximize: boolean;
  close: boolean;
  chrome?: "default" | "none";
}

/** For an app the caller does not know, so its window can still close. */
export const FALLBACK_CHROME: WindowChrome = {
  minimize: true,
  maximize: false,
  close: true,
};

/** Added to an alwaysOnTop window's z. z rises by one per raise. */
export const ON_TOP_Z = 2 ** 30;

export interface WindowFrameProps {
  id: string;
  /** With the id, names one window: a reopened id is a new window and a new frame. */
  openedAt: number;
  chromeOf(appId: string): WindowChrome | undefined;
  renderContent(windowId: string): ReactNode;
}

// Memoised on stable props, so neither a drag tick nor a focus change
// re-renders the app.
const WindowContent = memo(function WindowContent({
  id,
  renderContent,
}: Pick<WindowFrameProps, "id" | "renderContent">) {
  return renderContent(id);
});

/**
 * A selector for one window that remembers the last match. A closing frame
 * stays rendered for its fade, after the window has left the store, and it
 * still needs the title and the size. For a given store state it returns the
 * same value every time, as useSyncExternalStore needs.
 */
function lastKnownWindow(id: string, openedAt: number) {
  let last: WindowState | undefined;
  return (s: OSState): WindowState | undefined => {
    const found = s.windows.items.find(
      (w) => w.id === id && w.openedAt === openedAt,
    );
    if (found) last = found;
    return last;
  };
}

/**
 * One window. The outer element is the dialog and owns position, size,
 * stacking, visibility and will-change, and motion never touches it. The
 * surface inside draws the panel, and motion animates that: it scales and
 * fades in, flies to the dock icon on minimise (or fades, when no icon is
 * registered or motion is reduced), and fades out on close. A minimised
 * window ends hidden after the animation but stays mounted; a closed one
 * unmounts after its fade.
 */
export const WindowFrame = memo(function WindowFrame({
  id,
  openedAt,
  chromeOf,
  renderContent,
}: WindowFrameProps) {
  const [selectWindow] = useState(() => lastKnownWindow(id, openedAt));
  const win = useOS(selectWindow);
  const present = useIsPresent();
  // A fading frame is not focused, even when its id is: the same id may have
  // been reopened, and that is the new frame.
  const focused = useOS((s) => focusedWindow(s)?.id === id) && present;
  const fullscreen = useOS((s) => s.windows.mode === "fullscreen");
  const area = useOS((s) => s.windows.workArea);
  const { dragging, handleProps } = useDrag(id);
  const titleId = useId();
  const screen = useScreen();
  const reduced = useReducedMotionConfig() ?? false;
  // Which end the surface last reached, so the outer element is hidden only
  // after the minimise animation has played.
  const [settled, setSettled] = useState<"shown" | "minimized">("shown");
  if (!win) return null;

  const chrome = chromeOf(win.appId) ?? FALLBACK_CHROME;
  const bar = chrome.chrome !== "none";
  // size and position stay the restore geometry while maximised.
  const at = win.maximized ? area : win.position;
  const width = win.maximized ? area.w : win.size.width;
  const height = win.maximized ? area.h : win.size.height;
  // Read when a minimise starts, not on render: a getter measures layout.
  const custom: SurfaceCustom = {
    reduced,
    fly() {
      const icon = getIconRect(win.appId);
      return icon
        ? flyTo({ x: at.x, y: at.y, width, height }, toScreenRect(icon, screen))
        : null;
    },
  };

  return (
    <div
      role="dialog"
      aria-labelledby={bar ? titleId : undefined}
      aria-label={bar ? undefined : win.title}
      data-window-id={id}
      data-focused={focused ? "" : undefined}
      className={`absolute top-0 left-0 ${
        present && win.status === "open"
          ? "pointer-events-auto"
          : "pointer-events-none"
      }`}
      // A closing window takes no click and is not announced.
      inert={!present}
      // Capture phase, so content that stops propagation still raises it.
      onPointerDownCapture={() => os.windows.focusWindow(id)}
      style={{
        width,
        height,
        transform: `translate3d(${at.x}px, ${at.y}px, 0)`,
        zIndex: win.z + (win.alwaysOnTop ? ON_TOP_Z : 0),
        visibility:
          win.status === "minimized" && settled === "minimized"
            ? "hidden"
            : undefined,
        willChange: dragging ? "transform" : undefined,
      }}
    >
      <motion.div
        custom={custom}
        variants={surfaceVariants}
        initial="enter"
        animate={win.status === "minimized" ? "minimized" : "shown"}
        exit="exit"
        onAnimationStart={(definition) => {
          if (definition === "shown") setSettled("shown");
        }}
        onAnimationComplete={(definition) => {
          // A minimise cut short by a restore never completes, so this only
          // fires for one that played out.
          if (definition === "minimized") setSettled("minimized");
        }}
        className={`flex h-full w-full flex-col overflow-hidden bg-os-panel text-os-panel-fg ring-1 ring-white/10 ${
          win.maximized ? "rounded-none" : "rounded-os-lg"
        } ${focused ? "shadow-os-window" : "shadow-os-popover"}`}
      >
        {bar && (
          <TitleBar
            titleId={titleId}
            title={win.title}
            focused={focused}
            maximized={win.maximized}
            buttons={{
              minimize: chrome.minimize,
              maximize: chrome.maximize && !fullscreen,
              close: chrome.close,
            }}
            handleProps={handleProps}
            onMinimize={() => os.windows.minimizeWindow(id)}
            onToggleMaximize={() => os.windows.toggleMaximize(id)}
            onClose={() => void os.windows.closeWindow(id)}
          />
        )}
        <div
          data-window-content=""
          className="relative isolate min-h-0 flex-1 overflow-hidden"
        >
          <WindowIdContext value={id}>
            <WindowContent id={id} renderContent={renderContent} />
          </WindowIdContext>
        </div>
      </motion.div>
    </div>
  );
});
