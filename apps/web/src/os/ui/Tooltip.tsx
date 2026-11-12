"use client";

import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { useOptionalScreen } from "../screen/Screen";
import {
  usePlacement,
  type AnchorRect,
  type PlacementOptions,
} from "./placement";

export interface TooltipProps extends PlacementOptions {
  label: string;
  /** Hover waits this long, in ms. Keyboard focus shows at once. */
  delay?: number;
  /**
   * While true the tooltip never shows. The control stays the same element, so
   * a caller can keep one control while the reason for the tooltip comes and goes.
   */
  disabled?: boolean;
  /**
   * One control. A disabled `Button` works: it ignores the pointer, so the
   * wrapper hears the hover. So does one with `aria-disabled`, which keeps
   * keyboard focus as well.
   */
  children: ReactElement<{ "aria-describedby"?: string }>;
}

function TooltipBody({
  id,
  label,
  anchor,
  ...options
}: { id: string; label: string; anchor: AnchorRect } & PlacementOptions) {
  const ref = useRef<HTMLDivElement>(null);
  usePlacement(ref, anchor, options);
  // It never takes the pointer, so it can never block the control under it.
  return (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      style={{ visibility: "hidden" }}
      className="pointer-events-none absolute w-max max-w-xs rounded-os-sm bg-os-panel px-2 py-1 text-xs text-os-panel-fg shadow-os-popover"
    >
      {label}
    </div>
  );
}

/**
 * A label for a control: shown on hover and on keyboard focus. Outside a
 * `Screen` it has nowhere to portal to, so it renders its control and never
 * shows.
 */
export function Tooltip({
  label,
  delay = 400,
  side = "top",
  align = "center",
  gap,
  disabled = false,
  children,
}: TooltipProps) {
  const screen = useOptionalScreen();
  const portalTarget = screen?.portalTarget ?? null;
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // A press focuses a button, and without this the tooltip would come up after
  // every click. A mouse focuses during the press, but a tap focuses after
  // pointerup and pointerleave, so the flag lasts until the click (or a
  // cancel), and only a leave by a mouse clears it. (:focus-visible is no
  // help: jsdom's depends on history.)
  const pressing = useRef(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = () => {
    clearTimeout(timer.current);
    const r = wrapRef.current?.getBoundingClientRect();
    if (r)
      setAnchor({ left: r.left, top: r.top, width: r.width, height: r.height });
  };
  const hide = () => {
    clearTimeout(timer.current);
    setAnchor(null);
  };

  // Derived, not synced by an effect: pointer leave and blur already clear the
  // anchor, so a tooltip returns after re-enabling only while the pointer or
  // focus is still on the control.
  const shown = !disabled && anchor !== null && portalTarget !== null;
  const described = [children.props["aria-describedby"], id]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      ref={wrapRef}
      className="inline-flex"
      onPointerEnter={(e) => {
        if (e.pointerType === "touch") return;
        clearTimeout(timer.current);
        timer.current = setTimeout(show, delay);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") pressing.current = false;
        hide();
      }}
      onPointerDown={() => {
        pressing.current = true;
        hide();
      }}
      onPointerCancel={() => {
        pressing.current = false;
      }}
      onClick={() => {
        pressing.current = false;
      }}
      onFocus={() => {
        if (!pressing.current) show();
      }}
      onBlur={() => {
        pressing.current = false;
        hide();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") hide();
      }}
    >
      {shown
        ? cloneElement(children, { "aria-describedby": described })
        : children}
      {shown &&
        createPortal(
          <TooltipBody
            id={id}
            label={label}
            anchor={anchor}
            side={side}
            align={align}
            gap={gap}
          />,
          portalTarget,
        )}
    </span>
  );
}
