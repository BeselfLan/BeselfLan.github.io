"use client";

import { memo, useId, type ReactNode } from "react";
import { focusedWindow, os, useOS } from "../store";
import { TitleBar } from "./TitleBar";
import { useDrag } from "./useDrag";

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
 * One window. The outer element is the dialog and owns position, size,
 * stacking, visibility and will-change; the surface inside draws the panel.
 * Minimised windows stay mounted, hidden.
 */
export const WindowFrame = memo(function WindowFrame({
  id,
  chromeOf,
  renderContent,
}: WindowFrameProps) {
  const win = useOS((s) => s.windows.items.find((w) => w.id === id));
  const focused = useOS((s) => focusedWindow(s)?.id === id);
  const fullscreen = useOS((s) => s.windows.mode === "fullscreen");
  const area = useOS((s) => s.windows.workArea);
  const { dragging, handleProps } = useDrag(id);
  const titleId = useId();
  if (!win) return null;

  const chrome = chromeOf(win.appId) ?? FALLBACK_CHROME;
  const bar = chrome.chrome !== "none";
  // size and position stay the restore geometry while maximised.
  const at = win.maximized ? area : win.position;
  const width = win.maximized ? area.w : win.size.width;
  const height = win.maximized ? area.h : win.size.height;

  return (
    <div
      role="dialog"
      aria-labelledby={bar ? titleId : undefined}
      aria-label={bar ? undefined : win.title}
      data-window-id={id}
      data-focused={focused ? "" : undefined}
      className="pointer-events-auto absolute top-0 left-0"
      // Capture phase, so content that stops propagation still raises it.
      onPointerDownCapture={() => os.windows.focusWindow(id)}
      style={{
        width,
        height,
        transform: `translate3d(${at.x}px, ${at.y}px, 0)`,
        zIndex: win.z + (win.alwaysOnTop ? ON_TOP_Z : 0),
        visibility: win.status === "minimized" ? "hidden" : undefined,
        willChange: dragging ? "transform" : undefined,
      }}
    >
      <div
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
          <WindowContent id={id} renderContent={renderContent} />
        </div>
      </div>
    </div>
  );
});
