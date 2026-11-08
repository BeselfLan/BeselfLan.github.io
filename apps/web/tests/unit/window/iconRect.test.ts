import { describe, expect, it, vi } from "vitest";
import { getIconRect, registerIconRectGetter } from "@/os/window/iconRect";

const rect = { left: 100, top: 400, width: 48, height: 48 };

describe("iconRect", () => {
  it("has no rect before anything registers", () => {
    expect(getIconRect("x")).toBeNull();
  });

  it("registerIconRectGetter returns an unregister", () => {
    const g = vi.fn(() => rect);
    const unregister = registerIconRectGetter(g);
    expect(getIconRect("x")).toBe(rect);
    expect(g).toHaveBeenCalledWith("x");
    unregister();
    expect(getIconRect("x")).toBeNull();
  });

  it("a newer getter survives an old unregister", () => {
    const g1 = vi.fn(() => null);
    const g2 = vi.fn(() => rect);
    const unregister1 = registerIconRectGetter(g1);
    const unregister2 = registerIconRectGetter(g2);
    unregister1();
    expect(getIconRect("x")).toBe(rect);
    unregister2();
    expect(getIconRect("x")).toBeNull();
  });

  it("ends registered after register, unregister, register", () => {
    // What Strict Mode does to an effect.
    const g = vi.fn(() => rect);
    registerIconRectGetter(g)();
    const unregister = registerIconRectGetter(g);
    expect(getIconRect("x")).toBe(rect);
    unregister();
  });

  it("a getter that has no rect gives null", () => {
    const unregister = registerIconRectGetter(() => null);
    expect(getIconRect("x")).toBeNull();
    unregister();
  });

  it("a getter that throws gives null", () => {
    const unregister = registerIconRectGetter(() => {
      throw new Error("detached");
    });
    expect(getIconRect("x")).toBeNull();
    unregister();
  });
});
