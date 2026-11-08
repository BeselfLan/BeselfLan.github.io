import { useEffect, type ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { os } from "@/os/store";
import {
  isWindowVisible,
  subscribeWindowVisible,
  useWindowVisible,
} from "@/os/window/useWindowVisible";
import {
  frameOf,
  mountLayer,
  open,
  register,
  setupBrowser,
  teardownBrowser,
} from "./mountLayer";

let probeRenders = 0;

// Counts its own commits, so a re-render shows. It calls the hook with no
// arguments: the frame provides the id.
function Probe({ id }: { id: string }) {
  const visible = useWindowVisible();
  useEffect(() => {
    probeRenders++;
  });
  return <span data-testid={`probe-${id}`}>{String(visible)}</span>;
}
// Module level, so its identity is stable.
const renderProbe = (id: string): ReactNode => <Probe id={id} />;
const probe = (id = "a") => screen.getByTestId(`probe-${id}`).textContent;

beforeEach(() => {
  setupBrowser();
  probeRenders = 0;
});
afterEach(() => {
  // An own property shadows jsdom's getter on the prototype.
  delete (document as { visibilityState?: unknown }).visibilityState;
  teardownBrowser();
});

function setPageVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

// A minimise ends with the frame hidden. Waiting for it keeps motion's later
// state update out of the next test.
const settled = (id = "a") =>
  waitFor(() => expect(frameOf(id)!.style.visibility).toBe("hidden"));

describe("useWindowVisible", () => {
  it("follows the window and the page", async () => {
    register({ id: "a" });
    mountLayer({ renderContent: renderProbe });
    open("a");
    expect(probe()).toBe("true");

    act(() => os.windows.minimizeWindow("a"));
    expect(probe()).toBe("false");
    await settled();

    act(() => os.windows.restoreWindow("a"));
    expect(probe()).toBe("true");

    // The window is open, and the page is not.
    setPageVisibility("hidden");
    expect(probe()).toBe("false");
    setPageVisibility("visible");
    expect(probe()).toBe("true");
  });

  it("is false for a minimised window on a visible page and for an open one on a hidden page", async () => {
    register({ id: "a" }, { id: "b", at: { x: 400, y: 250 } });
    mountLayer({ renderContent: renderProbe });
    open("a");
    open("b");
    setPageVisibility("hidden");
    expect([probe("a"), probe("b")]).toEqual(["false", "false"]);
    setPageVisibility("visible");
    act(() => os.windows.minimizeWindow("b"));
    expect([probe("a"), probe("b")]).toEqual(["true", "false"]);
    await settled("b");
  });

  it("a drag tick causes no render", () => {
    register({ id: "a" });
    mountLayer({ renderContent: renderProbe });
    open("a");
    const before = probeRenders;
    expect(before).toBeGreaterThan(0);
    for (const x of [210, 260, 320]) {
      act(() => os.windows.moveWindow("a", { x, y: 120 }));
    }
    expect(probeRenders).toBe(before);
  });

  it("takes no arguments inside a frame", () => {
    register({ id: "a" });
    mountLayer({ renderContent: renderProbe });
    open("a");
    expect(useWindowVisible.length).toBe(0);
    expect(probe()).toBe("true");
  });

  it("throws outside a window", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe id="x" />)).toThrow(
      "useWindowVisible must be used inside a window",
    );
  });

  it("plain functions match the hook", async () => {
    register({ id: "a" });
    mountLayer({ renderContent: renderProbe });
    open("a");
    const cb = vi.fn<(visible: boolean) => void>();
    const unsubscribe = subscribeWindowVisible("a", cb);
    const agrees = () => expect(isWindowVisible("a")).toBe(probe() === "true");

    agrees();
    expect(isWindowVisible("a")).toBe(true);

    act(() => os.windows.moveWindow("a", { x: 300, y: 150 }));
    expect(cb).not.toHaveBeenCalled();

    act(() => os.windows.minimizeWindow("a"));
    agrees();
    expect(isWindowVisible("a")).toBe(false);
    expect(cb.mock.calls).toEqual([[false]]);
    await settled();

    act(() => os.windows.restoreWindow("a"));
    agrees();
    expect(cb.mock.calls).toEqual([[false], [true]]);

    setPageVisibility("hidden");
    agrees();
    expect(cb.mock.calls).toEqual([[false], [true], [false]]);
    setPageVisibility("visible");
    expect(cb.mock.calls).toEqual([[false], [true], [false], [true]]);

    unsubscribe();
    cb.mockClear();
    act(() => os.windows.minimizeWindow("a"));
    setPageVisibility("hidden");
    expect(cb).not.toHaveBeenCalled();
    await settled();
  });

  it("reports a window that is not open as not visible", () => {
    expect(isWindowVisible("nobody")).toBe(false);
    const cb = vi.fn();
    const unsubscribe = subscribeWindowVisible("nobody", cb);
    setPageVisibility("hidden");
    expect(cb).not.toHaveBeenCalled();
    unsubscribe();
  });
});
