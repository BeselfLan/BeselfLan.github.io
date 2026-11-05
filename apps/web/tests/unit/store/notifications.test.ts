import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { os, useOS } from "@/os/store";

const items = () => useOS.getState().notifications.items;

beforeEach(() => {
  useOS.setState(useOS.getInitialState(), true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("notifications", () => {
  it("ids stay unique", () => {
    const a = os.notifications.push({ title: "a" });
    const b = os.notifications.push({ title: "b" });
    os.notifications.dismiss(a);
    const c = os.notifications.push({ title: "c" });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("dismiss removes only that id", () => {
    os.notifications.push({ title: "a" });
    const b = os.notifications.push({ title: "b" });
    os.notifications.push({ title: "c" });
    os.notifications.dismiss(b);
    expect(items().map((i) => i.title)).toEqual(["a", "c"]);
  });

  it("clear empties the list", () => {
    os.notifications.push({ title: "a" });
    os.notifications.push({ title: "b" });
    expect(items()).toHaveLength(2);
    os.notifications.clear();
    expect(items()).toEqual([]);
  });

  it("keeps what was pushed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const id = os.notifications.push({ title: "t", body: "b", icon: "i.svg" });
    expect(items()).toEqual([
      {
        id,
        title: "t",
        body: "b",
        icon: "i.svg",
        createdAt: 1_700_000_000_000,
      },
    ]);
  });
});
