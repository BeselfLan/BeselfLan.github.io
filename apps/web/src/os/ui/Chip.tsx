import type { ReactNode } from "react";

export interface ChipProps {
  /** Makes the chip a toggle: `aria-pressed` follows it. */
  selected?: boolean;
  /** Makes the chip a button. */
  onClick?(): void;
  className?: string;
  children: ReactNode;
}

const SHAPE = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs";

/**
 * A small label. It is a `<span>` unless it acts (`onClick`) or toggles
 * (`selected`), and only a toggle has `aria-pressed`.
 */
export function Chip({ selected, onClick, className, children }: ChipProps) {
  const extra = className ? ` ${className}` : "";

  if (onClick === undefined && selected === undefined) {
    return (
      <span className={`${SHAPE} bg-white/10 text-os-panel-fg ${extra}`}>
        {children}
      </span>
    );
  }

  const tone = selected
    ? "bg-os-accent text-os-dark"
    : "bg-white/10 text-os-panel-fg hover:bg-white/20";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`${SHAPE} ${tone} outline-offset-2 focus-visible:outline-2 focus-visible:outline-os-accent ${extra}`}
    >
      {children}
    </button>
  );
}
