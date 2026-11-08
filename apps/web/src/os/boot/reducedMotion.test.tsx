import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { os, useOS } from "@/os/store";
import type { Settings } from "@/os/store/settings";
import {
  isReducedMotion,
  REDUCED_QUERY,
  systemReducesMotion,
  useBootReducedMotion,
} from "./reducedMotion";

type Setting = Settings["reducedMotion"];

/** A query-aware stub: only the reduced-motion query can match. */
function stubReduced(initial: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  const other = {
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  vi.stubGlobal("matchMedia", (q: string) =>
    q === REDUCED_QUERY ? query : other,
  );
  return {
    listeners,
    set(next: boolean) {
      query.matches = next;
      listeners.forEach((l) => l());
    },
  };
}

beforeEach(() => {
  useOS.setState(useOS.getInitialState(), true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isReducedMotion", () => {
  it.each<[Setting, boolean, boolean]>([
    ["system", false, false],
    ["system", true, true],
    ["on", false, true],
    ["on", true, true],
    ["off", false, false],
    ["off", true, false],
  ])("%s with the system at %s is %s", (setting, system, expected) => {
    expect(isReducedMotion(setting, system)).toBe(expected);
  });
});

describe("systemReducesMotion", () => {
  it("is false where matchMedia does not exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(systemReducesMotion()).toBe(false);
  });

  it("reads the reduced-motion query", () => {
    const media = stubReduced(false);
    expect(systemReducesMotion()).toBe(false);
    media.set(true);
    expect(systemReducesMotion()).toBe(true);
  });
});

describe("useBootReducedMotion", () => {
  it("follows the system while the setting is system", () => {
    const media = stubReduced(false);
    const { result } = renderHook(() => useBootReducedMotion());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it("stops listening when it unmounts", () => {
    const media = stubReduced(false);
    const { unmount } = renderHook(() => useBootReducedMotion());
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it("is true for 'on' while the query is false", () => {
    stubReduced(false);
    act(() => os.settings.update({ reducedMotion: "on" }));
    const { result } = renderHook(() => useBootReducedMotion());
    expect(result.current).toBe(true);
  });

  it("is false for 'off' while the query is true", () => {
    stubReduced(true);
    act(() => os.settings.update({ reducedMotion: "off" }));
    const { result } = renderHook(() => useBootReducedMotion());
    expect(result.current).toBe(false);
  });

  it("follows a change of the setting", () => {
    stubReduced(false);
    const { result } = renderHook(() => useBootReducedMotion());
    expect(result.current).toBe(false);
    act(() => os.settings.update({ reducedMotion: "on" }));
    expect(result.current).toBe(true);
  });

  it("does not throw without matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useBootReducedMotion());
    expect(result.current).toBe(false);
  });
});
