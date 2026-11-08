import type { Ref } from "react";
import { EntryIcon } from "./EntryIcon";
import type { EntryIconSource } from "./entryIcon";

export interface ProjectItemProps {
  entry: EntryIconSource;
  selected: boolean;
  onClick(): void;
  /** The item at the front of the ring. #83 sets it. */
  front?: boolean;
  tabIndex?: number;
  className?: string;
  /** React 19's ref prop. #83 uses it to write each item's pose. */
  ref?: Ref<HTMLButtonElement>;
}

// Whole literal strings, so Tailwind finds every class. Selected is a filled
// tile with an accent outline at offset 0; keyboard focus is a white outline at
// offset 2, which wins while focused. With both in the accent colour, a
// focused item and a selected item would look the same.
const BASE =
  "flex h-[150px] w-[150px] shrink-0 flex-col items-center gap-2 rounded-os-md p-2 text-center text-xs text-os-panel-fg " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const IDLE = `${BASE} hover:bg-white/5`;
const CHOSEN = `${BASE} bg-white/10 outline-2 outline-os-accent hover:bg-white/10`;

/**
 * One entry as a 150 x 150 button: its icon over its title, clamped to two
 * lines. Selection shows as an outline and `data-selected`. There is no ARIA
 * for it yet: `aria-expanded` and `aria-controls` come with #18's panel. The
 * title is not a heading, so the app keeps its one "Projects" heading.
 */
export function ProjectItem({
  entry,
  selected,
  onClick,
  front,
  tabIndex,
  className,
  ref,
}: ProjectItemProps) {
  const base = selected ? CHOSEN : IDLE;
  return (
    <button
      ref={ref}
      type="button"
      data-entry-id={entry.id}
      data-selected={selected ? "" : undefined}
      data-front={front ? "" : undefined}
      tabIndex={tabIndex}
      onClick={onClick}
      className={className ? `${base} ${className}` : base}
    >
      <EntryIcon entry={entry} size={96} />
      <span className="line-clamp-2 leading-tight">{entry.title}</span>
    </button>
  );
}
