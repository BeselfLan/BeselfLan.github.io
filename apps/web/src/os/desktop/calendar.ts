// Month maths for the calendar popover. Pure: no React, no clock. Every date
// comes from the local `Date(y, m, d)` constructor, so a time zone or a DST
// change cannot move a day.

// 0 = Sunday (Canada/US). Override: 1 for Monday-first.
export const WEEK_START = 0;

const DAYS = [
  { short: "Sun", long: "Sunday" },
  { short: "Mon", long: "Monday" },
  { short: "Tue", long: "Tuesday" },
  { short: "Wed", long: "Wednesday" },
  { short: "Thu", long: "Thursday" },
  { short: "Fri", long: "Friday" },
  { short: "Sat", long: "Saturday" },
] as const;

/** The column heads, first day of the week first. */
export const WEEKDAYS: readonly { short: string; long: string }[] = [
  ...DAYS.slice(WEEK_START),
  ...DAYS.slice(0, WEEK_START),
];

export interface DayCell {
  year: number;
  /** 0-based, like `Date`. */
  month: number;
  day: number;
  /** False for the days of the neighbouring months that fill the grid. */
  inMonth: boolean;
}

const WEEKS = 6;

/** Six weeks of seven days, the first week holding the 1st of the month. */
export function monthGrid(year: number, month: number): DayCell[] {
  const lead = (new Date(year, month, 1).getDay() - WEEK_START + 7) % 7;
  return Array.from({ length: WEEKS * 7 }, (_, i) => {
    const d = new Date(year, month, 1 - lead + i);
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    };
  });
}

/** The month `delta` months away; the year carries over. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

const LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

/** "December 2026" */
export function monthLabel(year: number, month: number): string {
  return LABEL.format(new Date(year, month, 1));
}

/** Compares the calendar date, never an index into the grid. */
export function sameDay(cell: DayCell, date: Date): boolean {
  return (
    cell.year === date.getFullYear() &&
    cell.month === date.getMonth() &&
    cell.day === date.getDate()
  );
}
