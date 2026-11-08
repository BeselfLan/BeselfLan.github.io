"use client";

import {
  useEffect,
  useRef,
  useState,
  type AriaRole,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useScreen } from "../screen/Screen";
import {
  usePlacement,
  type AnchorRect,
  type PlacementOptions,
} from "./placement";

export interface PopoverProps extends PlacementOptions {
  open: boolean;
  /** In client px: a `DOMRect` fits, and so does a point with size 0. */
  anchor: AnchorRect;
  onClose(): void;
  /** A press here is not an outside press, so a toggle button can close it itself. */
  triggerRef?: RefObject<HTMLElement | null>;
  role?: AriaRole;
  "aria-label"?: string;
  className?: string;
  children: ReactNode;
}

const within = (
  el: HTMLElement | null | undefined,
  target: EventTarget | null,
) => !!el && target instanceof Node && el.contains(target);

// Mounted only while open, so its effects need no `open` check and their
// cleanup is the close.
function PopoverBody({
  anchor,
  onClose,
  triggerRef,
  role = "dialog",
  "aria-label": ariaLabel,
  className,
  children,
  side,
  align,
  gap,
}: Omit<PopoverProps, "open">) {
  const ref = useRef<HTMLDivElement>(null);
  // Read in the first render: a child Menu's effect has already moved focus
  // by the time this component's effects run.
  const [previous] = useState(() => document.activeElement);
  usePlacement(ref, anchor, { side, align, gap });

  // Capture phase on document, so a handler that stops propagation cannot
  // hide an outside press. Esc is skipped when a child (a Menu) took it.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (
        within(ref.current, e.target) ||
        within(triggerRef?.current, e.target)
      )
        return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, triggerRef]);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [previous]);

  return (
    <div
      ref={ref}
      data-popover=""
      role={role}
      aria-label={ariaLabel}
      tabIndex={-1}
      style={{ visibility: "hidden" }}
      className={`pointer-events-auto absolute rounded-os-md bg-os-panel text-os-panel-fg shadow-os-popover outline-none ${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}

/**
 * A floating panel inside the screen, placed in screen units and closed by
 * Esc or a press outside. Focus moves in and returns to where it was.
 */
export function Popover({ open, ...body }: PopoverProps) {
  const { portalTarget } = useScreen();
  if (!open || !portalTarget) return null;
  return createPortal(<PopoverBody {...body} />, portalTarget);
}
