import { createRef, type ReactNode } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScreenValue } from "@/os/screen/Screen";
import type { AnchorRect } from "@/os/ui/placement";
import { Popover, type PopoverProps } from "@/os/ui/Popover";
import { setupFakeScreen } from "./fakeScreen";

const fake = vi.hoisted(() => ({ value: undefined as unknown as ScreenValue }));
vi.mock("@/os/screen/Screen", () => ({ useScreen: () => fake.value }));
setupFakeScreen(fake);

// A point, in client px.
const point = (left = 120, top = 60): AnchorRect => ({
  left,
  top,
  width: 0,
  height: 0,
});
const root = () => document.querySelector<HTMLElement>("[data-popover]");
const inner = () => document.querySelector<HTMLElement>("[data-inner]")!;

function ui(props: Partial<PopoverProps> = {}, extra: ReactNode = null) {
  return (
    <>
      <div data-testid="outside" />
      {extra}
      <Popover open anchor={point()} onClose={() => {}} {...props}>
        <button data-inner="">inside</button>
      </Popover>
    </>
  );
}
const outside = () =>
  document.querySelector<HTMLElement>("[data-testid=outside]")!;

describe("Popover placement and portal", () => {
  it("uses the target from useScreen", () => {
    render(ui());
    expect(root()?.parentElement).toBe(fake.value.portalTarget);
  });

  it("renders nothing until the target exists", () => {
    fake.value = { ...fake.value, portalTarget: null };
    const { container } = render(ui());
    expect(root()).toBeNull();
    expect(container.querySelector("[data-inner]")).toBeNull();
  });

  it("appears once the target exists", () => {
    const target = fake.value.portalTarget;
    fake.value = { ...fake.value, portalTarget: null };
    const { rerender } = render(ui());
    expect(root()).toBeNull();
    fake.value = { ...fake.value, portalTarget: target };
    rerender(ui());
    expect(root()?.parentElement).toBe(target);
  });

  it("renders nothing when closed", () => {
    render(ui({ open: false }));
    expect(root()).toBeNull();
    expect(document.querySelector("[data-inner]")).toBeNull();
  });

  it("can be pressed", () => {
    render(ui());
    expect(root()?.classList.contains("pointer-events-auto")).toBe(true);
  });

  it("is a dialog unless told otherwise, and takes a label", () => {
    const { rerender } = render(ui({ "aria-label": "Menu bar" }));
    expect(root()?.getAttribute("role")).toBe("dialog");
    expect(root()?.getAttribute("aria-label")).toBe("Menu bar");
    rerender(ui({ role: "presentation" }));
    expect(root()?.getAttribute("role")).toBe("presentation");
  });

  it("places itself in screen units", () => {
    // Scale 0.5, box at (20, 10): client (120, 60) is screen (200, 100).
    render(ui({ gap: 0, anchor: point(120, 60) }));
    expect(root()?.style.left).toBe("200px");
    expect(root()?.style.top).toBe("100px");
  });

  it("follows a new anchor", () => {
    const { rerender } = render(ui({ gap: 0, anchor: point(120, 60) }));
    rerender(ui({ gap: 0, anchor: point(220, 160) }));
    expect(root()?.style.left).toBe("400px");
    expect(root()?.style.top).toBe("300px");
  });

  it("the anchor's size is in client px too", () => {
    // Height 20 client px is 40 screen units below the point at y = 100.
    render(
      ui({
        gap: 0,
        anchor: { left: 120, top: 60, width: 0, height: 20 },
        side: "bottom",
      }),
    );
    expect(root()?.style.top).toBe("140px");
  });

  it("stays inside the screen", () => {
    // Client (900, 480) is screen (1760, 940): far outside 1440x900.
    render(ui({ anchor: point(900, 480) }));
    expect(root()?.style.left).toBe("1240px");
    expect(root()?.style.top).toBe("800px");
  });

  it("stays hidden until placed", () => {
    const seen: string[] = [];
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        if (this.hasAttribute("data-popover")) seen.push(this.style.visibility);
        return 200;
      },
    );
    render(ui());
    expect(seen).toEqual(["hidden"]);
    expect(root()?.style.visibility).toBe("visible");
  });
});

describe("Popover closing", () => {
  it("closes on Esc", () => {
    const onClose = vi.fn();
    render(ui({ onClose }));
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Esc another handler already took", () => {
    const onClose = vi.fn();
    render(ui({ onClose }));
    const took = (e: KeyboardEvent) => e.preventDefault();
    inner().addEventListener("keydown", took);
    fireEvent.keyDown(inner(), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on an outside press, not on one inside", () => {
    const onClose = vi.fn();
    render(ui({ onClose }));
    fireEvent.pointerDown(inner());
    fireEvent.pointerDown(root()!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(outside());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("an outside press that stops propagation still closes", () => {
    const onClose = vi.fn();
    render(ui({ onClose }));
    outside().addEventListener("pointerdown", (e) => e.stopPropagation());
    fireEvent.pointerDown(outside());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a press on the trigger is not an outside press", () => {
    const onClose = vi.fn();
    const triggerRef = createRef<HTMLButtonElement>();
    render(
      ui({ onClose, triggerRef }, <button ref={triggerRef}>toggle</button>),
    );
    fireEvent.pointerDown(triggerRef.current!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(outside());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the listeners go when it closes", () => {
    const onClose = vi.fn();
    const { rerender } = render(ui({ onClose }));
    rerender(ui({ onClose, open: false }));
    fireEvent.pointerDown(outside());
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the listeners go when it unmounts", () => {
    const onClose = vi.fn();
    const { unmount } = render(ui({ onClose }));
    unmount();
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Popover focus", () => {
  const withTrigger = (open: boolean) =>
    ui({ open }, <button data-testid="trigger">open</button>);
  const trigger = () =>
    document.querySelector<HTMLElement>("[data-testid=trigger]")!;

  it("moves in and comes back", () => {
    const { rerender } = render(withTrigger(false));
    trigger().focus();
    expect(document.activeElement).toBe(trigger());

    rerender(withTrigger(true));
    expect(root()?.contains(document.activeElement)).toBe(true);

    rerender(withTrigger(false));
    expect(document.activeElement).toBe(trigger());
  });

  it("leaves focus alone when it is already inside", () => {
    render(
      <Popover open anchor={point()} onClose={() => {}}>
        <input autoFocus data-inner="" />
      </Popover>,
    );
    expect(document.activeElement).toBe(inner());
  });
});
