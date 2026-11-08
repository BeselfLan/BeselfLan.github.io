import { useEffect, useState } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { os } from "@/os/store";
import { registerIconRectGetter } from "@/os/window/iconRect";
import { FakeResizeObserver } from "../helpers/browser";
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

// The surface is the frame's only child: the element motion animates. In
// jsdom motion runs its JS animations, which write inline styles.
const surface = (id: string) => frameOf(id)!.firstElementChild as HTMLElement;
const hidden = (id: string) => frameOf(id)!.style.visibility === "hidden";
const settledHidden = (id: string) =>
  waitFor(() => expect(frameOf(id)!.style.visibility).toBe("hidden"));
const clickIn = (id: string, label: string) =>
  fireEvent.click(titleBarOf(id)!.querySelector(`[aria-label="${label}"]`)!);

// A scale of 0.5 with the box at (20, 10) in the client: client (100, 400) is
// screen (160, 780).
function scaleHalf() {
  const observer = FakeResizeObserver.last;
  act(() => observer.trigger(720, 450));
  vi.spyOn(
    document.querySelector("[data-screen-box]")!,
    "getBoundingClientRect",
  ).mockReturnValue({
    left: 20,
    top: 10,
    x: 20,
    y: 10,
    width: 720,
    height: 450,
    right: 740,
    bottom: 460,
    toJSON() {},
  } as DOMRect);
}

let unregister: (() => void) | null = null;
const iconAt = (rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}) => {
  unregister = registerIconRectGetter(() => rect);
};

let frames: ReturnType<typeof setupBrowser>["frames"];

beforeEach(() => {
  ({ frames } = setupBrowser());
  cleanup.mockClear();
});
afterEach(() => {
  unregister?.();
  unregister = null;
  teardownBrowser();
});

describe("enter", () => {
  it("enter uses the 2.3 values", async () => {
    register({ id: "a" });
    mountLayer();
    open("a");
    expect(surface("a").style.opacity).toBe("0");
    expect(surface("a").style.transform).toContain("scale(0.96)");
    await waitFor(() => expect(surface("a").style.opacity).toBe("1"));
    await waitFor(() =>
      expect(["", "none"]).toContain(surface("a").style.transform),
    );
  });
});

describe("close", () => {
  it("close fades, then unmounts", async () => {
    register({ id: "a" });
    mountLayer({ renderContent: renderCounter });
    open("a");
    clickIn("a", "Close");
    // Still there for the fade, and out of reach.
    expect(frameOf("a")).not.toBeNull();
    expect(frameOf("a")!.hasAttribute("inert")).toBe(true);
    expect(frameOf("a")!.classList.contains("pointer-events-auto")).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();

    await waitFor(() => expect(frameOf("a")).toBeNull());
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("a closing frame keeps its last state", async () => {
    register({ id: "a" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mountLayer();
    open("a");
    act(() => void os.windows.closeWindow("a"));
    expect(windowState("a")).toBeUndefined();
    // A frame that reads only the store would render nothing here.
    expect(frameOf("a")).not.toBeNull();
    expect(frameOf("a")!.querySelector("h2")!.textContent).toBe("a");
    await waitFor(() => expect(frameOf("a")).toBeNull());
    expect(error).not.toHaveBeenCalled();
  });

  it("a window reopened while it fades is a new frame", async () => {
    register({ id: "a" });
    // Two openings in one millisecond would share an openedAt.
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 10));
    mountLayer({ renderContent: renderCounter });
    open("a");
    fireEvent.click(screen.getByTestId("counter"));
    expect(screen.getByTestId("counter").textContent).toBe("n=1");

    act(() => void os.windows.closeWindow("a"));
    open("a");
    expect(document.querySelectorAll('[data-window-id="a"]')).toHaveLength(2);

    await waitFor(() =>
      expect(document.querySelectorAll('[data-window-id="a"]')).toHaveLength(1),
    );
    // The first app is gone and the second is fresh.
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("counter").textContent).toBe("n=0");
    expect(frameOf("a")!.hasAttribute("inert")).toBe(false);
  });
});

describe("minimise", () => {
  it("minimise flies to the registered rect", async () => {
    register({ id: "a", width: 400, height: 300, at: { x: 200, y: 100 } });
    mountLayer();
    open("a");
    await waitFor(() => expect(surface("a").style.opacity).toBe("1"));
    scaleHalf();
    iconAt({ left: 100, top: 400, width: 48, height: 48 });

    act(() => os.windows.minimizeWindow("a"));
    await settledHidden("a");
    const transform = surface("a").style.transform;
    expect(transform).toContain("translateX(-192px)");
    expect(transform).toContain("translateY(578px)");
    expect(transform).toContain("scale(0.24)");
    expect(surface("a").style.opacity).toBe("0");
  });

  it("minimise fades when nothing is registered", async () => {
    register({ id: "a" }, { id: "b", at: { x: 400, y: 250 } });
    mountLayer();
    open("a");
    open("b");
    await waitFor(() => expect(surface("b").style.opacity).toBe("1"));

    // No getter at all.
    act(() => os.windows.minimizeWindow("a"));
    await settledHidden("a");
    expect(surface("a").style.opacity).toBe("0");
    expect(surface("a").style.transform).not.toContain("translate");

    // A getter with nothing for this app.
    unregister = registerIconRectGetter(() => null);
    act(() => os.windows.minimizeWindow("b"));
    await settledHidden("b");
    expect(surface("b").style.opacity).toBe("0");
    expect(surface("b").style.transform).not.toContain("translate");
  });

  it("a minimised window ends hidden and mounted", async () => {
    register({ id: "a" });
    mountLayer({ renderContent: renderCounter });
    open("a");
    act(() => os.windows.minimizeWindow("a"));
    // Mid-animation: still drawn, but it takes no click.
    expect(frameOf("a")!.style.visibility).toBe("");
    expect(frameOf("a")!.classList.contains("pointer-events-none")).toBe(true);
    expect(frameOf("a")!.classList.contains("pointer-events-auto")).toBe(false);

    await settledHidden("a");
    expect(frameOf("a")!.isConnected).toBe(true);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("restore shows the window again", async () => {
    register({ id: "a" }, { id: "b", at: { x: 400, y: 250 } });
    mountLayer();
    open("a");
    open("b");
    iconAt({ left: 100, top: 400, width: 48, height: 48 });
    act(() => os.windows.minimizeWindow("a"));
    await settledHidden("a");

    act(() => os.windows.restoreWindow("a"));
    // At once, at its old place, and raised.
    expect(hidden("a")).toBe(false);
    expect(frameOf("a")!.style.transform).toMatch(
      /^translate3d\(200px, 100px, 0(px)?\)$/,
    );
    expect(frameOf("a")!.hasAttribute("data-focused")).toBe(true);
    expect(Number(frameOf("a")!.style.zIndex)).toBeGreaterThan(
      Number(frameOf("b")!.style.zIndex),
    );
    await waitFor(() => expect(surface("a").style.opacity).toBe("1"));
    await waitFor(() =>
      expect(["", "none"]).toContain(surface("a").style.transform),
    );
  });

  it("minimising again during a restore still animates", async () => {
    register({ id: "a" });
    mountLayer();
    open("a");
    act(() => os.windows.minimizeWindow("a"));
    await settledHidden("a");
    act(() => os.windows.restoreWindow("a"));
    act(() => os.windows.minimizeWindow("a"));
    // The restore reset the settled state, so it is drawn until this ends.
    expect(hidden("a")).toBe(false);
    await settledHidden("a");
    expect(surface("a").style.opacity).toBe("0");
  });

  it("a minimise cut short by a restore does not hide the next one", async () => {
    register({ id: "a" });
    mountLayer();
    open("a");
    await waitFor(() => expect(surface("a").style.opacity).toBe("1"));
    act(() => os.windows.minimizeWindow("a"));
    act(() => os.windows.restoreWindow("a"));
    await waitFor(() => expect(surface("a").style.opacity).toBe("1"));
    // Past the end of the cancelled minimise.
    await new Promise((r) => setTimeout(r, 300));
    expect(hidden("a")).toBe(false);

    act(() => os.windows.minimizeWindow("a"));
    expect(hidden("a")).toBe(false);
    await settledHidden("a");
  });
});

describe("dragging", () => {
  it("dragging still works", async () => {
    register({ id: "a" });
    mountLayer();
    open("a");
    await waitFor(() => expect(surface("a").style.opacity).toBe("1"));

    fireEvent.pointerDown(titleBarOf("a")!, ptr());
    fireEvent.pointerMove(titleBarOf("a")!, ptr({ clientX: 360 }));
    act(() => frames.run());
    fireEvent.pointerUp(titleBarOf("a")!, ptr({ clientX: 360 }));
    expect(frameOf("a")!.style.transform).toMatch(
      /^translate3d\(260px, 100px, 0(px)?\)$/,
    );
    // motion owns the surface's transform and never the frame's.
    expect(surface("a").style.transform).not.toContain("translate3d");
    expect(screen.queryByRole("dialog")).toBe(frameOf("a"));
  });
});
