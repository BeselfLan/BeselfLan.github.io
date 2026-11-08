"use client";

import { useEffect, useState } from "react";

// The visitor's own time zone: no `timeZone` option. `hourCycle: "h23"` gives
// "00" at midnight, where `hour12: false` gives "24" in some engines.
const FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface ClockParts {
  /** "Wed Nov 4" */
  date: string;
  /** "14:05" */
  time: string;
}

export function formatClock(date: Date): ClockParts {
  const parts: Record<string, string> = {};
  for (const part of FORMAT.formatToParts(date)) parts[part.type] = part.value;
  return {
    date: `${parts.weekday} ${parts.month} ${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

// Past the boundary, so a timer that fires a hair early still lands in the
// new minute.
const MARGIN_MS = 50;
const MINUTE_MS = 60_000;

/**
 * The current time, replaced at each minute boundary. Plan 4.2 says a
 * 30-second interval, which can show a minute up to 30 s late; aligning to the
 * minute costs the same. Override: `setInterval(30_000)`.
 *
 * The timer is armed from the time held in state, not from the clock at mount,
 * so a render that fell on one side of a boundary and an effect on the other
 * is corrected after 50 ms rather than a minute later. Each tick sets new
 * state, which re-runs the effect and arms the next one.
 */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const next = (Math.floor(now.getTime() / MINUTE_MS) + 1) * MINUTE_MS;
    const timer = setTimeout(
      () => setNow(new Date()),
      Math.max(0, next - Date.now()) + MARGIN_MS,
    );
    return () => clearTimeout(timer);
  }, [now]);
  return now;
}
