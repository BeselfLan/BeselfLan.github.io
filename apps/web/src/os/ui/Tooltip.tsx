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
import { useScreen } from "../screen/Screen";
import {
  usePlacement,
  type AnchorRect,
  type PlacementOptions,
} from "./placement";

export interface TooltipProps extends PlacementOptions {
  label: string;
  /** Hover waits this long, in ms. Keyboard focus shows at once. */
  delay?: number;
  /** One control. A disabled `Button` works: it ignores the pointer, so the wrapper hears the hover. */
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

/** A label for a control: shown on hover and on keyboard focus. */
export function Tooltip({
  label,
  delay = 400,
  side = "top",
  align = "center",
  gap,
  children,
}: TooltipProps) {
  const { portalTarget } = useScreen();
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // A mouse press focuses a button. Without this the tooltip would come up
  // after every click. (:focus-visible is no help: jsdom's depends on history.)
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

  const shown = anchor !== null && portalTarget !== null;
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
      onPointerLeave={() => {
        pressing.current = false;
        hide();
      }}
      onPointerDown={() => {
        pressing.current = true;
        hide();
      }}
      onPointerUp={() => {
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
