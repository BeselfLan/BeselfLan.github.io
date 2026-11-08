import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Screen } from "@/os/screen/Screen";
import { os, useOS } from "@/os/store";
import type { Point, WindowApp } from "@/os/store/windows";
import { clampToWorkArea, useDrag } from "@/os/window/useDrag";
import { FakeResizeObserver, stubFrames, stubMedia } from "../helpers/browser";

const app: WindowApp = {
  id: "w",
  name: "w",
  window: { width: 400, height: 300, initialPosition: { x: 200, y: 100 } },
  capabilities: { maximize: true },
  singleton: true,
};

type Drag = ReturnType<typeof useDrag>;
let drag: Drag;
const record = (d: Drag) => {
  drag = d;
};
let onDragEnd: ReturnType<typeof vi.fn<(p: Point) => void>>;

function Probe() {
  const d = useDrag("w", { onDragEnd });
  record(d);
  return <div data-testid="handle" {...d.handleProps} />;
}

let frames: ReturnType<typeof stubFrames>;
let setPointerCapture: ReturnType<typeof vi.fn<(id: number) => void>>;
let move: ReturnType<typeof vi.spyOn>;

const handle = () =>
  document.querySelector<HTMLElement>("[data-testid=handle]")!;
const pos = () => useOS.getState().windows.items[0].position;
const scaleTo = (w: number, h: number) =>
  act(() => FakeResizeObserver.last.trigger(w, h));
const ev = (over: object = {}) => ({
  pointerId: 7,
  button: 0,
  isPrimary: true,
  clientX: 300,
  clientY: 120,
  ...over,
});
const press = (over: object = {}) => fireEvent.pointerDown(handle(), ev(over));
const moveTo = (x: number, y: number, over: object = {}) =>
  fireEvent.pointerMove(handle(), ev({ clientX: x, clientY: y, ...over }));
const frame = () => act(() => frames.run());

function mount(scale?: [number, number]) {
  const result = render(
    <Screen>
      <Probe />
    </Screen>,
  );
  if (scale) scaleTo(...scale);
  os.windows.openApp("w");
  return result;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  stubMedia(false);
  frames = stubFrames();
  localStorage.clear();
  useOS.setState(useOS.getInitialState(), true);
  os.windows.setAppLookup(() => app);
  setPointerCapture = vi.fn<(id: number) => void>();
  Element.prototype.setPointerCapture = setPointerCapture;
  onDragEnd = vi.fn<(p: Point) => void>();
  move = vi.spyOn(os.windows, "moveWindow");
});

afterEach(() => {
  delete (Element.prototype as { setPointerCapture?: unknown })
    .setPointerCapture;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("clampToWorkArea", () => {
  const area = { x: 64, y: 32, w: 1376, h: 868 };
  it.each([
    [
      { x: -1000, y: 200 },
      { x: -296, y: 200 },
    ],
    [
      { x: 5000, y: 200 },
      { x: 1400, y: 200 },
    ],
    [
      { x: 300, y: -100 },
      { x: 300, y: 32 },
    ],
    [
      { x: 300, y: 5000 },
      { x: 300, y: 860 },
    ],
  ])("keeps 40 px of title bar in the work area: %j", (to, expected) => {
    expect(clampToWorkArea(to, 400, area)).toEqual(expected);
  });
});

describe("useDrag", () => {
  it.each([
    [[720, 450] as [number, number], { x: 400, y: 220 }],
    [[2880, 1800] as [number, number], { x: 250, y: 130 }],
  ])("divides the pointer delta by the scale", (size, expected) => {
    mount(size);
    press();
    moveTo(400, 180);
    frame();
    expect(pos()).toEqual(expected);
  });

  it("tracks from the press, not per tick", () => {
    mount();
    press();
    moveTo(5000, 120);
    frame();
    expect(pos().x).toBe(1400);
    moveTo(400, 120);
    frame();
    expect(pos().x).toBe(300);
  });

  it("writes at most once per frame", () => {
    mount();
    press();
    for (const x of [310, 320, 330, 340, 350]) moveTo(x, 120);
    expect(move).not.toHaveBeenCalled();
    frame();
    expect(move).toHaveBeenCalledTimes(1);
    expect(move).toHaveBeenCalledWith("w", { x: 250, y: 100 });
  });

  it("the last move is not lost", () => {
    mount();
    press();
    moveTo(350, 120);
    // A cancel keeps the last move: its own point is not a release point.
    fireEvent.pointerCancel(handle(), ev({ clientX: 0, clientY: 0 }));
    expect(pos()).toEqual({ x: 250, y: 100 });
  });

  it("the release point wins", () => {
    mount();
    press();
    moveTo(350, 120);
    // The up arrives with no frame run: Chromium can deliver it before the
    // last queued move, so the up's own point is where the drag ends.
    fireEvent.pointerUp(handle(), ev({ clientX: 400, clientY: 120 }));
    expect(pos()).toEqual({ x: 300, y: 100 });
    expect(onDragEnd).toHaveBeenCalledWith({ x: 300, y: 100 });
  });

  it("a release where it already is writes nothing", () => {
    mount();
    press();
    fireEvent.pointerUp(handle(), ev());
    expect(move).not.toHaveBeenCalled();
    expect(onDragEnd).toHaveBeenCalledWith({ x: 200, y: 100 });
  });

  it("the left edge clamps through the hook", () => {
    mount();
    press();
    moveTo(-5000, 120);
    frame();
    expect(pos().x).toBe(-296);
  });

  it("a second drag moves the window", () => {
    mount();
    press();
    moveTo(350, 120);
    fireEvent.pointerUp(handle(), ev({ clientX: 350 }));
    expect(pos()).toEqual({ x: 250, y: 100 });

    press();
    moveTo(400, 120);
    frame();
    expect(pos().x).toBe(350);
  });

  it("ignores other buttons", () => {
    mount();
    press({ button: 2 });
    expect(drag.dragging).toBe(false);
    expect(setPointerCapture).not.toHaveBeenCalled();
  });

  it("captures the pointer", () => {
    mount();
    press({ pointerId: 42 });
    expect(setPointerCapture).toHaveBeenCalledWith(42);
  });

  it("pointercancel ends the drag", () => {
    mount();
    press();
    fireEvent.pointerCancel(handle(), ev());
    expect(drag.dragging).toBe(false);
    move.mockClear();
    moveTo(500, 300);
    frame();
    expect(move).not.toHaveBeenCalled();
  });

  it("a lost capture ends the drag", () => {
    mount();
    press();
    expect(drag.dragging).toBe(true);
    fireEvent.lostPointerCapture(handle(), ev());
    expect(drag.dragging).toBe(false);
  });

  it("another pointer cannot move the window", () => {
    mount();
    press();
    moveTo(500, 300, { pointerId: 9 });
    frame();
    expect(move).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle(), ev({ pointerId: 9 }));
    expect(drag.dragging).toBe(true);
  });

  it("unmounting mid-drag writes nothing", () => {
    const { unmount } = mount();
    press();
    moveTo(400, 200);
    unmount();
    frames.run();
    expect(move).not.toHaveBeenCalled();
    expect(frames.pending()).toBe(0);
  });

  it("a maximised window does not drag", () => {
    mount();
    os.windows.toggleMaximize("w");
    act(() => {});
    press();
    expect(drag.dragging).toBe(false);
    expect(setPointerCapture).not.toHaveBeenCalled();
  });

  it("dragging is true only during a drag", () => {
    mount();
    expect(drag.dragging).toBe(false);
    press();
    expect(drag.dragging).toBe(true);
    fireEvent.pointerUp(handle(), ev());
    expect(drag.dragging).toBe(false);
  });

  it("onDragEnd gets the final position", () => {
    mount();
    press();
    moveTo(5000, 120);
    fireEvent.pointerUp(handle(), ev({ clientX: 5000 }));
    fireEvent.lostPointerCapture(handle(), ev());
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledWith({ x: 1400, y: 100 });
    press();
    fireEvent.pointerUp(handle(), ev());
    expect(onDragEnd).toHaveBeenCalledTimes(2);
  });

  it("the handle sets touch-action: none", () => {
    mount();
    expect(drag.handleProps.style.touchAction).toBe("none");
    expect(drag.handleProps.style.userSelect).toBe("none");
  });
});
