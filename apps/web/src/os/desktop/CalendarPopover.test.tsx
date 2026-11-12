import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Screen } from "@/os/screen/Screen";
import { os, useOS } from "@/os/store";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { alphaOf, contrast, hex, luminance, over } from "./contrast.testutil";
import { TopBar } from "./TopBar";

const NAME = "Calendar and notifications";

beforeEach(() => {
  setupBrowser();
  useOS.setState((s) => {
    s.boot.stage = "desktop";
  });
  // Only Date is faked, so the clock's own timer never fires. Local time, so
  // the tests hold in any zone.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 11, 4, 10, 0));
});
afterEach(() => {
  vi.useRealTimers();
  teardownBrowser();
});

const q = (selector: string) => document.querySelector<HTMLElement>(selector);

function openCalendar() {
  render(
    <Screen>
      <TopBar />
    </Screen>,
  );
  fireEvent.click(q("[data-clock]")!);
  return screen.getByRole("dialog", { name: NAME });
}
const dialog = () => screen.getByRole("dialog", { name: NAME });
const month = () => q("[data-calendar-month]")!.textContent;
const marked = () => dialog().querySelectorAll('[aria-current="date"]');
const press = (name: string) =>
  fireEvent.click(within(dialog()).getByRole("button", { name }));
const pushAll = (...titles: string[]) =>
  act(() => {
    for (const title of titles) os.notifications.push({ title });
  });
const rows = () =>
  within(screen.getByRole("list", { name: "Notifications" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

describe("the calendar", () => {
  it("opens inside the screen's portal with the month grid", () => {
    openCalendar();
    expect(dialog().closest("[data-screen-portal]")).not.toBeNull();
    expect(month()).toBe("December 2026");

    const heads = [...dialog().querySelectorAll("thead th")];
    expect(heads.map((th) => th.textContent)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
    const cells = [...dialog().querySelectorAll("tbody td")];
    expect(cells).toHaveLength(42);
    expect(dialog().querySelectorAll("tbody tr")).toHaveLength(6);
    // December 2026 starts on a Tuesday: two days of November lead the grid.
    expect(cells.slice(0, 3).map((td) => td.textContent)).toEqual([
      "29",
      "30",
      "1",
    ]);
  });

  it("dims the days outside the month", () => {
    openCalendar();
    const spans = [...dialog().querySelectorAll("tbody td > span")];
    const dim = spans.map((s) => s.classList.contains("text-white/50"));
    expect(dim.slice(0, 3)).toEqual([true, true, false]);
    // 31 days in December, 2 leading: cells 2 to 32 are in the month.
    expect(dim.filter((d) => !d)).toHaveLength(31);
  });

  it("a day outside the month is at least 4.5:1", () => {
    openCalendar();
    // December 2026 starts with two November days: the first cell is one.
    const out = dialog().querySelector<HTMLElement>("tbody td > span")!;
    expect(out.textContent).toBe("29");
    const alpha = alphaOf(out.className, "text-white");
    expect(
      alpha,
      `no text-white/NN class on "${out.className}"`,
    ).not.toBeNull();

    // The popover's own background, --os-panel (bg-os-panel).
    const panel = hex("#1e1e1e");
    const white = hex("#ffffff");
    const ratio = (a: number) => contrast(over(white, a, panel), panel);
    expect(ratio(alpha!)).toBeGreaterThanOrEqual(4.5);
    // The old 0.40 is below the bar, so this test can fail.
    expect(ratio(0.4)).toBeLessThan(4.5);
  });

  it("marks today by date", () => {
    openCalendar();
    expect(marked()).toHaveLength(1);
    expect(marked()[0].textContent).toBe("4");
    // The 1st is the third cell: an index of day - 1 would mark December 2.
    const dec2 = dialog().querySelectorAll("tbody td")[3];
    expect(dec2.textContent).toBe("2");
    expect(dec2.hasAttribute("aria-current")).toBe(false);
    expect(marked()[0].querySelector("span")!.className).toContain(
      "ring-os-accent",
    );
  });

  it("reads the month of the clock, in any year", () => {
    vi.setSystemTime(new Date(2027, 0, 31, 23, 59));
    openCalendar();
    expect(month()).toBe("January 2027");
    expect(marked()).toHaveLength(1);
    expect(marked()[0].textContent).toBe("31");
  });

  it("rolls over the months", () => {
    openCalendar();
    press("Next month");
    expect(month()).toBe("January 2027");
    // Today is not in the January grid, so nothing is marked.
    expect(marked()).toHaveLength(0);

    press("Previous month");
    press("Previous month");
    expect(month()).toBe("November 2026");
    // The November grid runs on to December 12, so today is still found.
    expect(marked()).toHaveLength(1);
    expect(marked()[0].textContent).toBe("4");
    expect(marked()[0].querySelector("span")!.className).toContain(
      "text-white/50",
    );
  });

  it("goes back across the year end as well", () => {
    vi.setSystemTime(new Date(2027, 0, 15));
    openCalendar();
    press("Previous month");
    expect(month()).toBe("December 2026");
  });

  it("starts on today's month again when it reopens", () => {
    openCalendar();
    press("Next month");
    expect(month()).toBe("January 2027");

    act(() => os.shell.setPopover(null));
    expect(screen.queryByRole("dialog", { name: NAME })).toBeNull();
    fireEvent.click(q("[data-clock]")!);
    expect(month()).toBe("December 2026");
  });

  it("announces the month politely", () => {
    openCalendar();
    expect(q("[data-calendar-month]")!.getAttribute("aria-live")).toBe(
      "polite",
    );
  });
});

describe("notifications, newest first", () => {
  it("says so when there are none", () => {
    openCalendar();
    expect(dialog().textContent).toContain("No notifications");
    expect(screen.queryByRole("list", { name: "Notifications" })).toBeNull();
    expect(
      (
        within(dialog()).getByRole("button", {
          name: "Clear all",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("lists the last one pushed first", () => {
    openCalendar();
    // Date is faked and still, so both share a createdAt.
    pushAll("A", "B");
    const items = useOS.getState().notifications.items;
    expect(items[0].createdAt).toBe(items[1].createdAt);
    expect(rows()).toEqual(["B", "A"]);
    expect(dialog().textContent).not.toContain("No notifications");
  });

  it("shows the title and the body", () => {
    openCalendar();
    act(() => void os.notifications.push({ title: "Settings", body: "Soon." }));
    const [row] = within(
      screen.getByRole("list", { name: "Notifications" }),
    ).getAllByRole("listitem");
    expect(row.textContent).toContain("Settings");
    expect(row.textContent).toContain("Soon.");
  });

  it("shows one that arrives while it is open", () => {
    openCalendar();
    pushAll("A");
    expect(rows()).toEqual(["A"]);
    pushAll("B");
    expect(rows()).toEqual(["B", "A"]);
  });

  it("dismisses one", () => {
    openCalendar();
    pushAll("A", "B");
    press("Dismiss B");
    expect(rows()).toEqual(["A"]);
    expect(useOS.getState().notifications.items.map((n) => n.title)).toEqual([
      "A",
    ]);
  });

  it("clears all", () => {
    openCalendar();
    pushAll("A", "B");
    const clear = within(dialog()).getByRole("button", {
      name: "Clear all",
    }) as HTMLButtonElement;
    expect(clear.disabled).toBe(false);

    fireEvent.click(clear);
    expect(useOS.getState().notifications.items).toEqual([]);
    expect(screen.queryByRole("list", { name: "Notifications" })).toBeNull();
    expect(dialog().textContent).toContain("No notifications");
    expect(clear.disabled).toBe(true);
  });

  it("keeps the focus in the dialog when a button goes away", () => {
    openCalendar();
    pushAll("A");
    press("Dismiss A");
    expect(document.activeElement).toBe(dialog());

    pushAll("B");
    press("Clear all");
    expect(document.activeElement).toBe(dialog());
  });

  it("is still there for the next opening", () => {
    openCalendar();
    pushAll("A");
    act(() => os.shell.setPopover(null));
    fireEvent.click(q("[data-clock]")!);
    expect(rows()).toEqual(["A"]);
  });
});

describe("the contrast helper", () => {
  it("agrees with WCAG", () => {
    const black = hex("#000000");
    const white = hex("#ffffff");
    expect(contrast(white, black)).toBeCloseTo(21, 5);
    expect(contrast(black, white)).toBeCloseTo(21, 5);
    const grey = hex("#767676");
    expect(contrast(grey, grey)).toBe(1);
    // The grey that only just passes 4.5:1 on white.
    expect(Math.abs(contrast(grey, white) - 4.54)).toBeLessThan(0.01);
    // Straight alpha, per channel.
    expect(over(white, 0.5, black)).toEqual([127.5, 127.5, 127.5]);
    expect(luminance(white)).toBeCloseTo(1, 10);
    expect(luminance(black)).toBe(0);
    // Whole classes only.
    expect(alphaOf("a text-white/50 b", "text-white")).toBe(0.5);
    expect(alphaOf("text-white/50", "bg-white")).toBeNull();
    expect(alphaOf("text-white/50x text-white", "text-white")).toBeNull();
  });
});
