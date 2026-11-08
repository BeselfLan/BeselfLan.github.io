// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { BootLine } from "./bootScript";
import { createScriptStore, NO_LINES } from "./scriptStore";

const line = (text: string): BootLine => ({
  text,
  status: "text",
  group: "flavour",
  delayMs: 0,
  ids: [],
});

describe("the script store", () => {
  it("starts with the empty constant and returns the same array until set", () => {
    const store = createScriptStore();
    expect(store.get()).toBe(NO_LINES);
    expect(store.get()).toBe(store.get());

    const lines = [line("a")];
    store.set(lines);
    expect(store.get()).toBe(lines);
    expect(store.get()).toBe(store.get());
  });

  it("tells every subscriber on set, and nobody after unsubscribe", () => {
    const store = createScriptStore();
    const a = vi.fn();
    const b = vi.fn();
    const offA = store.subscribe(a);
    store.subscribe(b);

    store.set([line("a")]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    offA();
    store.set([line("b")]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("keeps one store apart from another", () => {
    const one = createScriptStore();
    const two = createScriptStore();
    one.set([line("a")]);
    expect(two.get()).toBe(NO_LINES);
  });

  it("calls a subscriber that unsubscribes itself without skipping the next", () => {
    const store = createScriptStore();
    const calls: string[] = [];
    const off = store.subscribe(() => {
      calls.push("first");
      off();
    });
    store.subscribe(() => calls.push("second"));
    store.set([line("a")]);
    expect(calls).toEqual(["first", "second"]);
  });
});
