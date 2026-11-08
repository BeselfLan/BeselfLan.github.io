import { useEffect, useState } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { os } from "@/os/store";
import {
  frameOf,
  mountLayer,
  open,
  ptr,
  register,
  setupBrowser,
  teardownBrowser,
  titleBarOf,
  windowState,
} from "./mountLayer";

const cleanup = vi.fn();

function Counter() {
  const [n, setN] = useState(0);
  useEffect(() => () => cleanup(), []);
  return (
    <button data-testid="counter" onClick={() => setN((v) => v + 1)}>
      {`n=${n}`}
    </button>
  );
}
const renderCounter = () => <Counter />;
const counter = () => screen.getByTestId("counter");

const style = (id: string) => frameOf(id)!.style;
const zOf = (id: string) => windowState(id)!.z;

beforeEach(() => {
  setupBrowser();
  cleanup.mockClear();
});
afterEach(teardownBrowser);

describe("WindowFrame", () => {
  it("takes its size and position from the state", () => {
    register({ id: "a", width: 640, height: 480, at: { x: 200, y: 100 } });
    mountLayer();
    open("a");
    expect(style("a").width).toBe("640px");
    expect(style("a").height).toBe("480px");
    expect(style("a").transform).toMatch(
      /^translate3d\(200px, 100px, 0(px)?\)$/,
    );
    act(() => os.windows.moveWindow("a", { x: 300, y: 150 }));
    expect(style("a").transform).toMatch(
      /^translate3d\(300px, 150px, 0(px)?\)$/,
    );
  });

  it("has no resize handles", () => {
    register({ id: "a" });
    mountLayer();
    open("a");
    const frame = frameOf("a")!;
    expect(frame.children).toHaveLength(1);
    const surface = frame.firstElementChild!;
    expect(surface.children).toHaveLength(2);
    expect(surface.children[0].hasAttribute("data-titlebar")).toBe(true);
    expect(surface.children[1].hasAttribute("data-window-content")).toBe(true);
  });

  it("is a labelled dialog that follows the title", () => {
    register({ id: "a" });
    mountLayer();
    open("a");
    expect(screen.getByRole("dialog", { name: "a" })).toBe(frameOf("a"));
    act(() => os.windows.setTitle("a", "Renamed"));
    expect(screen.getByRole("dialog", { name: "Renamed" })).toBe(frameOf("a"));
  });

  it("raises when pressed anywhere, even where propagation is stopped", () => {
    register({ id: "a" }, { id: "b", at: { x: 400, y: 250 } });
    mountLayer({
      renderContent: (id) => (
        <div
          data-testid={`content-${id}`}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ),
    });
    open("a");
    open("b");
    expect(zOf("b")).toBeGreaterThan(zOf("a"));
    expect(frameOf("b")!.hasAttribute("data-focused")).toBe(true);

    fireEvent.pointerDown(screen.getByTestId("content-a"), ptr());
    expect(zOf("a")).toBeGreaterThan(zOf("b"));
    expect(frameOf("a")!.hasAttribute("data-focused")).toBe(true);
    expect(frameOf("b")!.hasAttribute("data-focused")).toBe(false);
  });

  it("does not move DOM nodes when it raises", () => {
    register({ id: "a" }, { id: "b", at: { x: 400, y: 250 } });
    mountLayer();
    open("a");
    open("b");
    const frames = () => [
      ...document.querySelectorAll<HTMLElement>("[data-window-id]"),
    ];
    const before = frames();
    fireEvent.pointerDown(titleBarOf("a")!, ptr());
    const after = frames();
    expect(after).toHaveLength(2);
    after.forEach((el, i) => expect(el).toBe(before[i]));
    expect(Number(style("a").zIndex)).toBeGreaterThan(
      Number(style("b").zIndex),
    );
  });

  it("keeps an alwaysOnTop window above a raised one", () => {
    register(
      { id: "c", alwaysOnTop: true },
      { id: "a", at: { x: 300, y: 150 } },
    );
    mountLayer();
    open("c");
    open("a");
    fireEvent.pointerDown(titleBarOf("a")!, ptr());
    expect(zOf("a")).toBeGreaterThan(zOf("c"));
    expect(Number(style("c").zIndex)).toBeGreaterThan(
      Number(style("a").zIndex),
    );
  });

  it("fills the work area when maximised and restores", () => {
    register({
      id: "a",
      width: 640,
      height: 480,
      at: { x: 200, y: 100 },
      maximize: true,
    });
    mountLayer();
    act(() =>
      os.windows.setScreen({
        mode: "laptop",
        workArea: { x: 100, y: 50, w: 1000, h: 700 },
      }),
    );
    open("a");
    act(() => os.windows.toggleMaximize("a"));
    expect(style("a").width).toBe("1000px");
    expect(style("a").height).toBe("700px");
    expect(style("a").transform).toMatch(
      /^translate3d\(100px, 50px, 0(px)?\)$/,
    );
    act(() => os.windows.toggleMaximize("a"));
    expect(style("a").width).toBe("640px");
    expect(style("a").height).toBe("480px");
    expect(style("a").transform).toMatch(
      /^translate3d\(200px, 100px, 0(px)?\)$/,
    );
  });

  it("squares its corners while maximised", () => {
    register({ id: "a", maximize: true });
    mountLayer();
    open("a");
    const surface = frameOf("a")!.firstElementChild!;
    expect(surface.classList.contains("rounded-os-lg")).toBe(true);
    act(() => os.windows.toggleMaximize("a"));
    expect(surface.classList.contains("rounded-none")).toBe(true);
    expect(surface.classList.contains("rounded-os-lg")).toBe(false);
  });

  it("sets will-change only while dragging", () => {
    register({ id: "a" }, { id: "b", at: { x: 400, y: 250 } });
    mountLayer();
    open("a");
    open("b");
    expect([style("a").willChange, style("b").willChange]).toEqual(["", ""]);

    fireEvent.pointerDown(titleBarOf("b")!, ptr());
    expect(style("b").willChange).toBe("transform");
    expect(style("a").willChange).toBe("");

    fireEvent.pointerUp(titleBarOf("b")!, ptr());
    expect([style("a").willChange, style("b").willChange]).toEqual(["", ""]);
  });

  it("shows a focused and an unfocused shadow", () => {
    register({ id: "a" }, { id: "b", at: { x: 400, y: 250 } });
    mountLayer();
    open("a");
    open("b");
    const shadow = (id: string) =>
      frameOf(id)!.firstElementChild!.className.match(/shadow-os-\w+/)?.[0];
    expect(shadow("b")).toBe("shadow-os-window");
    expect(shadow("a")).toBe("shadow-os-popover");
  });

  it("keeps the app mounted while minimised", async () => {
    register({ id: "a" });
    mountLayer({ renderContent: renderCounter });
    open("a");
    fireEvent.click(counter());
    fireEvent.click(counter());
    expect(counter().textContent).toBe("n=2");

    act(() => os.windows.minimizeWindow("a"));
    // Hidden once the animation has played, not before.
    expect(style("a").visibility).toBe("");
    await waitFor(() => expect(style("a").visibility).toBe("hidden"));
    expect(frameOf("a")!.isConnected).toBe(true);
    expect(cleanup).not.toHaveBeenCalled();

    act(() => os.windows.restoreWindow("a"));
    expect(style("a").visibility).toBe("");
    expect(counter().textContent).toBe("n=2");
  });

  it("unmounts the app on close, after the fade", async () => {
    register({ id: "a" });
    mountLayer({ renderContent: renderCounter });
    open("a");
    fireEvent.click(titleBarOf("a")!.querySelector('[aria-label="Close"]')!);
    expect(frameOf("a")).not.toBeNull();
    expect(cleanup).not.toHaveBeenCalled();
    await waitFor(() => expect(frameOf("a")).toBeNull());
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("puts the content in an isolate wrapper", () => {
    register({ id: "a" });
    mountLayer();
    open("a");
    const content = frameOf("a")!.querySelector("[data-window-content]")!;
    expect(content.classList.contains("isolate")).toBe(true);
  });

  it("can be pressed", () => {
    register({ id: "a" });
    mountLayer();
    open("a");
    expect(frameOf("a")!.classList.contains("pointer-events-auto")).toBe(true);
  });
});
