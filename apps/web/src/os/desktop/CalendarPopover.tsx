"use client";

import { useState, type MouseEvent, type RefObject } from "react";
import { os, useOS } from "../store";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import type { AnchorRect } from "../ui/placement";
import { Popover } from "../ui/Popover";
import {
  monthGrid,
  monthLabel,
  sameDay,
  shiftMonth,
  WEEKDAYS,
  type DayCell,
} from "./calendar";

// Module level, so the Popover's listener effect keeps one subscription.
const closePopover = () => os.shell.setPopover(null);

const DAY = "inline-flex size-8 items-center justify-center";

function dayClass(cell: DayCell, isToday: boolean): string {
  const dim = cell.inMonth ? "" : " text-white/50";
  const ring = isToday ? " rounded-full ring-2 ring-os-accent" : "";
  return `${DAY}${dim}${ring}`;
}

// A removed button drops the focus to the page, so the next Tab would start
// from the top of it. The dialog takes the focus instead and keeps Esc working.
function keepFocus(e: MouseEvent<HTMLButtonElement>): void {
  e.currentTarget.closest<HTMLElement>("[data-popover]")?.focus();
}

/**
 * The popover's content. The shown month is state here, not in the parent:
 * the Popover mounts its children only while open, so the calendar starts on
 * today's month every time it opens.
 */
function CalendarBody({ today }: { today: Date }) {
  const [shown, setShown] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));
  const items = useOS((s) => s.notifications.items);
  // The store's array is frozen, so copy it before reversing. The newest is
  // last, and sorting by `createdAt` would tie whenever two share a ms.
  const newest = [...items].reverse();

  const cells = monthGrid(shown.year, shown.month);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) =>
    cells.slice(w * 7, w * 7 + 7),
  );
  const go = (delta: number) =>
    setShown((s) => shiftMonth(s.year, s.month, delta));

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="ghost"
          aria-label="Previous month"
          className="px-2"
          onClick={() => go(-1)}
        >
          <Icon>
            <path d="M15 18l-6-6 6-6" />
          </Icon>
        </Button>
        <p data-calendar-month="" aria-live="polite" className="font-medium">
          {monthLabel(shown.year, shown.month)}
        </p>
        <Button
          variant="ghost"
          aria-label="Next month"
          className="px-2"
          onClick={() => go(1)}
        >
          <Icon>
            <path d="M9 18l6-6-6-6" />
          </Icon>
        </Button>
      </div>

      <table
        data-calendar-grid=""
        className="w-full table-fixed text-center text-sm"
      >
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th
                key={d.short}
                scope="col"
                abbr={d.long}
                className="pb-1 text-xs font-medium text-white/60"
              >
                {d.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={`${week[0].year}-${week[0].month}-${week[0].day}`}>
              {week.map((cell) => {
                const isToday = sameDay(cell, today);
                return (
                  <td
                    key={`${cell.year}-${cell.month}-${cell.day}`}
                    aria-current={isToday ? "date" : undefined}
                    className="p-0.5"
                  >
                    <span className={dayClass(cell, isToday)}>{cell.day}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 border-t border-white/15 pt-2">
        <h2 className="text-xs font-semibold text-white/60 uppercase">
          Notifications
        </h2>
        {newest.length === 0 ? (
          <p className="py-2 text-sm text-white/70">No notifications</p>
        ) : (
          <ul aria-label="Notifications" className="max-h-60 overflow-y-auto">
            {newest.map((n) => (
              <li key={n.id} className="flex items-start gap-2 py-1.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.title}</p>
                  {n.body && <p className="text-white/70">{n.body}</p>}
                </div>
                <Button
                  variant="ghost"
                  aria-label={`Dismiss ${n.title}`}
                  className="px-2"
                  onClick={(e) => {
                    keepFocus(e);
                    os.notifications.dismiss(n.id);
                  }}
                >
                  <Icon>
                    <path d="M18 6L6 18M6 6l12 12" />
                  </Icon>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="ghost"
          className="mt-1"
          disabled={items.length === 0}
          onClick={(e) => {
            keepFocus(e);
            os.notifications.clear();
          }}
        >
          Clear all
        </Button>
      </div>
    </>
  );
}

export interface CalendarPopoverProps {
  open: boolean;
  /** In client px, read from the clock button when it opened. */
  anchor: AnchorRect;
  triggerRef: RefObject<HTMLElement | null>;
  /** The current time, from `useClock()`. */
  today: Date;
}

/**
 * The calendar under the clock: a month grid with today ringed, then the
 * notifications, newest first. Open state is `shell.openPopover`, set by the
 * clock button; the popover closes itself on Esc and on an outside press.
 */
export function CalendarPopover({
  open,
  anchor,
  triggerRef,
  today,
}: CalendarPopoverProps) {
  return (
    <Popover
      open={open}
      anchor={anchor}
      triggerRef={triggerRef}
      onClose={closePopover}
      role="dialog"
      aria-label="Calendar and notifications"
      side="bottom"
      align="center"
      gap={4}
      className="w-90 p-3"
    >
      <CalendarBody today={today} />
    </Popover>
  );
}
