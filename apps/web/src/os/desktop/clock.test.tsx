import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatClock, useClock } from "./clock";

describe("formatClock", () => {
  it("writes the date and a 24-hour time", () => {
    expect(formatClock(new Date(2026, 10, 4, 14, 5))).toEqual({
      date: "Wed Nov 4",
      time: "14:05",
    });
  });

  it("pads the hour and the minute", () => {
    expect(formatClock(new Date(2026, 10, 4, 9, 5)).time).toBe("09:05");
  });

  it("writes midnight as 00:00 on the new day", () => {
    expect(formatClock(new Date(2026, 10, 5, 0, 0))).toEqual({
      date: "Thu Nov 5",
      time: "00:00",
    });
  });

  it("keeps noon and the last minute of the day in 24-hour form", () => {
    expect(formatClock(new Date(2026, 10, 4, 12, 0)).time).toBe("12:00");
    expect(formatClock(new Date(2026, 10, 4, 23, 59)).time).toBe("23:59");
  });
});

function Time() {
  return <span data-testid="time">{formatClock(useClock()).time}</span>;
}

const shown = () => document.querySelector("[data-testid=time]")?.textContent;

describe("useClock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function mountAt(...args: [number, number, number, number, number, number]) {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date(...args));
    return render(<Time />);
  }

  it("turns over on the minute, not 30 seconds after mount", () => {
    mountAt(2026, 10, 4, 14, 5, 10);
    expect(shown()).toBe("14:05");

    // 14:05:59.9
    act(() => void vi.advanceTimersByTime(49_900));
    expect(shown()).toBe("14:05");

    // 14:06:00.1. An interval counted from mount would change at 14:06:10.
    act(() => void vi.advanceTimersByTime(200));
    expect(shown()).toBe("14:06");
  });

  it("keeps going, one minute at a time", () => {
    mountAt(2026, 10, 4, 14, 5, 10);
    act(() => void vi.advanceTimersByTime(50_100));
    expect(shown()).toBe("14:06");
    act(() => void vi.advanceTimersByTime(59_000));
    expect(shown()).toBe("14:06");
    act(() => void vi.advanceTimersByTime(2_000));
    expect(shown()).toBe("14:07");
  });

  it("ticks at once when mounted just before a boundary", () => {
    // One second to the boundary, 50 ms of margin.
    mountAt(2026, 10, 4, 14, 5, 59);
    expect(shown()).toBe("14:05");
    act(() => void vi.advanceTimersByTime(1_100));
    expect(shown()).toBe("14:06");
  });

  it("clears its timer on unmount", () => {
    const { unmount } = mountAt(2026, 10, 4, 14, 5, 10);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
