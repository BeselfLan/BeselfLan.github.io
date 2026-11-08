"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

/**
 * One row of a menu. A separator is a rule, not a choice. Callers import this
 * type for their rows.
 */
export type MenuItem =
  | {
      id: string;
      label: string;
      disabled?: boolean;
      onSelect(): void;
      separator?: false;
    }
  | { id: string; separator: true };

export interface MenuProps {
  items: readonly MenuItem[];
  onClose(): void;
  "aria-label"?: string;
  className?: string;
}

// Focus marks the current item, so the DOM is the only state: no index to
// keep in step with it.
const enabledItems = (root: HTMLElement | null) =>
  Array.from(
    root?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ??
      [],
  );

/**
 * A vertical menu. Put it inside a `Popover` and give both the same
 * `onClose`. Arrows, Home and End move focus, and Esc and Tab close.
 */
export function Menu({
  items,
  onClose,
  "aria-label": ariaLabel,
  className,
}: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // A plain effect, not a layout effect: a child's layout effect runs before
  // its parent's, so inside a Popover the item would still be hidden and a
  // browser refuses to focus a hidden element.
  useEffect(() => {
    enabledItems(ref.current)[0]?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      // A Popover around this menu skips an Esc that was already handled,
      // so the one onClose is not called twice.
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Tab") {
      onClose();
      return;
    }
    const list = enabledItems(ref.current);
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (e.key === "ArrowDown") next = (at + 1) % list.length;
    else if (e.key === "ArrowUp") next = at <= 0 ? list.length - 1 : at - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    else return;
    e.preventDefault();
    list[next].focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`flex min-w-40 flex-col p-1${className ? ` ${className}` : ""}`}
    >
      {items.map((item) =>
        item.separator ? (
          <div
            key={item.id}
            role="separator"
            className="my-1 h-px bg-white/15"
          />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            // Close first: a choice that opens another popover must not be
            // closed by this one.
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className="rounded-os-sm px-3 py-1.5 text-left text-sm hover:bg-white/10 focus:bg-white/10 focus:outline-2 focus:-outline-offset-2 focus:outline-os-accent disabled:pointer-events-none disabled:opacity-50"
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
