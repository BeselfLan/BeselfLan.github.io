import { describe, expect, it } from "vitest";
import {
  monthGrid,
  monthLabel,
  sameDay,
  shiftMonth,
  WEEK_START,
  WEEKDAYS,
} from "./calendar";

const dayOfWeek = (c: { year: number; month: number; day: number }) =>
  new Date(c.year, c.month, c.day).getDay();

describe("the month grid starts on Sunday", () => {
  it("fills 42 cells from the Sunday before the 1st", () => {
    const grid = monthGrid(2026, 11); // December 2026 starts on a Tuesday
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({
      year: 2026,
      month: 10,
      day: 29,
      inMonth: false,
    });
    expect(grid[2]).toEqual({ year: 2026, month: 11, day: 1, inMonth: true });
    for (let i = 0; i < 42; i += 7) expect(dayOfWeek(grid[i])).toBe(0);
  });

  it("starts at the 1st when the month starts on a Sunday", () => {
    // November 2026 starts on a Sunday.
    expect(monthGrid(2026, 10)[0]).toEqual({
      year: 2026,
      month: 10,
      day: 1,
      inMonth: true,
    });
  });

  it("carries the year backwards", () => {
    const grid = monthGrid(2027, 0); // January 2027 starts on a Friday
    expect(grid[0]).toEqual({
      year: 2026,
      month: 11,
      day: 27,
      inMonth: false,
    });
    expect(grid[5]).toEqual({ year: 2027, month: 0, day: 1, inMonth: true });
  });

  it("carries the year forwards", () => {
    const grid = monthGrid(2026, 11);
    expect(grid[41]).toEqual({ year: 2027, month: 0, day: 9, inMonth: false });
  });

  it("marks exactly the days of the month as in the month", () => {
    const grid = monthGrid(2028, 1); // a leap February
    expect(grid.filter((c) => c.inMonth)).toHaveLength(29);
    expect(grid.every((c) => c.inMonth === (c.month === 1))).toBe(true);
  });

  it("steps one calendar day at a time across a DST change", () => {
    // March 2026 holds the spring-forward day in North America.
    const grid = monthGrid(2026, 2);
    for (let i = 1; i < grid.length; i++) {
      const before = new Date(
        grid[i - 1].year,
        grid[i - 1].month,
        grid[i - 1].day,
      );
      before.setDate(before.getDate() + 1);
      expect(sameDay(grid[i], before)).toBe(true);
    }
  });

  it("heads the columns Sunday first", () => {
    expect(WEEK_START).toBe(0);
    expect(WEEKDAYS.map((d) => d.short)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
    expect(WEEKDAYS[0].long).toBe("Sunday");
  });
});

describe("shiftMonth carries the year", () => {
  it("moves across a year end in both directions", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
  });
});

describe("monthLabel", () => {
  it("names the month and the year", () => {
    expect(monthLabel(2026, 11)).toBe("December 2026");
    expect(monthLabel(2027, 0)).toBe("January 2027");
  });
});

describe("sameDay", () => {
  const today = new Date(2026, 11, 4, 23, 59);
  it("compares year, month and day", () => {
    const cell = (year: number, month: number, day: number) => ({
      year,
      month,
      day,
      inMonth: true,
    });
    expect(sameDay(cell(2026, 11, 4), today)).toBe(true);
    expect(sameDay(cell(2026, 11, 5), today)).toBe(false);
    expect(sameDay(cell(2026, 10, 4), today)).toBe(false);
    expect(sameDay(cell(2025, 11, 4), today)).toBe(false);
  });
});
