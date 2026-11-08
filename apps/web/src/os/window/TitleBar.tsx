"use client";

import type { ReactNode, SyntheticEvent } from "react";
import type { DragHandleProps } from "./useDrag";

export interface TitleBarProps {
  titleId: string;
  title: string;
  focused: boolean;
  maximized: boolean;
  /** Which buttons to show. They render in D19 order. */
  buttons: { minimize: boolean; maximize: boolean; close: boolean };
  handleProps: DragHandleProps;
  onMinimize(): void;
  onToggleMaximize(): void;
  onClose(): void;
}

const stop = (e: SyntheticEvent) => e.stopPropagation();

// Whole class strings per tone, so no element carries two hover:bg-* classes.
// Dark text on the orange follows the same contrast call as the Button: about
// 5:1, where white gives about 3.6:1.
const BASE =
  "grid size-6 place-items-center rounded-full text-os-panel-fg " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-os-accent";
const TONES = {
  plain: `${BASE} bg-white/10 hover:bg-white/20 active:bg-white/30`,
  close: `${BASE} bg-white/10 hover:bg-os-accent hover:text-os-dark active:bg-os-accent`,
};

function WindowButton({
  label,
  tone = "plain",
  onClick,
  children,
}: {
  label: string;
  tone?: keyof typeof TONES;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={TONES[tone]}
      onClick={onClick}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        width={16}
        height={16}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      >
        {children}
      </svg>
    </button>
  );
}

/**
 * The drag handle of a window: a centred title, and the buttons on the right.
 * It is 40 px high, so the 40 px clamp keeps all of it reachable.
 */
export function TitleBar({
  titleId,
  title,
  focused,
  maximized,
  buttons,
  handleProps,
  onMinimize,
  onToggleMaximize,
  onClose,
}: TitleBarProps) {
  return (
    <div
      data-titlebar=""
      {...handleProps}
      onDoubleClick={buttons.maximize ? onToggleMaximize : undefined}
      className="relative flex h-10 shrink-0 items-center bg-white/5 px-2"
    >
      {/* Spans the whole bar with equal padding, so it is centred on the bar,
          not on the space beside the buttons. It cannot take the pointer, or
          it would cover them. */}
      <h2
        id={titleId}
        className={`pointer-events-none absolute inset-x-0 truncate px-28 text-center text-sm font-medium ${
          focused ? "text-os-panel-fg" : "text-os-panel-fg/60"
        }`}
      >
        {title}
      </h2>
      {/* A press here is not a drag: if the bar took pointer capture, the click
          would land on the bar and the button would never fire. */}
      <div
        className="relative ml-auto flex items-center gap-2"
        onPointerDown={stop}
        onDoubleClick={stop}
      >
        {buttons.minimize && (
          <WindowButton label="Minimise" onClick={onMinimize}>
            <path d="M4 8h8" />
          </WindowButton>
        )}
        {buttons.maximize && (
          <WindowButton
            label={maximized ? "Restore" : "Maximise"}
            onClick={onToggleMaximize}
          >
            {maximized ? (
              <>
                <path d="M6 4h6v6" />
                <rect x="4" y="6" width="6" height="6" rx="1" />
              </>
            ) : (
              <rect x="4" y="4" width="8" height="8" rx="1" />
            )}
          </WindowButton>
        )}
        {buttons.close && (
          <WindowButton label="Close" tone="close" onClick={onClose}>
            <path d="M5 5l6 6M11 5l-6 6" />
          </WindowButton>
        )}
      </div>
    </div>
  );
}
