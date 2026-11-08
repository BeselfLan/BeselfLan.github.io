import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScreenValue } from "@/os/screen/Screen";
import { Button } from "@/os/ui/Button";
import { Tooltip, type TooltipProps } from "@/os/ui/Tooltip";
import { setupFakeScreen } from "./fakeScreen";

const fake = vi.hoisted(() => ({ value: undefined as unknown as ScreenValue }));
vi.mock("@/os/screen/Screen", () => ({ useScreen: () => fake.value }));
setupFakeScreen(fake);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const ui = (props: Partial<TooltipProps> = {}) => (
  <Tooltip label="Save" {...props}>
    <button>Go</button>
  </Tooltip>
);
const button = () => document.querySelector("button")!;
const tip = () => document.querySelector<HTMLElement>('[role="tooltip"]');
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const focus = () => act(() => button().focus());
const blur = () => act(() => button().blur());

describe("Tooltip showing", () => {
  it("shows on hover after the delay", () => {
    render(ui());
    fireEvent.pointerEnter(button());
    wait(399);
    expect(tip()).toBeNull();
    wait(1);
    expect(tip()?.textContent).toBe("Save");
  });

  it("shows on keyboard focus at once", () => {
    render(ui());
    focus();
    expect(tip()?.textContent).toBe("Save");
  });

  it("takes its delay from a prop", () => {
    render(ui({ delay: 100 }));
    fireEvent.pointerEnter(button());
    wait(99);
    expect(tip()).toBeNull();
    wait(1);
    expect(tip()).not.toBeNull();
  });

  it("leaving before the delay shows nothing", () => {
    render(ui());
    fireEvent.pointerEnter(button());
    wait(200);
    fireEvent.pointerLeave(button());
    wait(1000);
    expect(tip()).toBeNull();
  });

  it("a press does not show it", () => {
    render(ui());
    fireEvent.pointerDown(button());
    focus();
    expect(tip()).toBeNull();

    // Once the press is over, the next focus shows it again.
    fireEvent.pointerUp(button());
    blur();
    focus();
    expect(tip()).not.toBeNull();
  });

  it("a press hides a tooltip that is up", () => {
    render(ui());
    fireEvent.pointerEnter(button());
    wait(400);
    expect(tip()).not.toBeNull();
    fireEvent.pointerDown(button());
    expect(tip()).toBeNull();
  });

  it("a touch does not show it", () => {
    render(ui());
    fireEvent.pointerEnter(button(), { pointerType: "touch" });
    wait(1000);
    expect(tip()).toBeNull();
  });

  it("shows for a disabled Button, whose wrapper hears the hover", () => {
    render(
      <Tooltip label="Soon">
        <Button disabled>Play</Button>
      </Tooltip>,
    );
    fireEvent.pointerEnter(button());
    wait(400);
    expect(tip()?.textContent).toBe("Soon");
  });
});

describe("Tooltip hiding", () => {
  it.each([
    ["leave", () => fireEvent.pointerLeave(button())],
    ["blur", () => blur()],
    ["Esc", () => fireEvent.keyDown(button(), { key: "Escape" })],
  ])("hides on %s", (_, hide) => {
    render(ui());
    focus();
    expect(tip()).not.toBeNull();
    hide();
    expect(tip()).toBeNull();
  });

  it("another key does not hide it", () => {
    render(ui());
    focus();
    fireEvent.keyDown(button(), { key: "a" });
    expect(tip()).not.toBeNull();
  });

  it("unmounting clears the timer", () => {
    const { unmount } = render(ui());
    fireEvent.pointerEnter(button());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Tooltip portal and description", () => {
  it("is described by aria-describedby while shown", () => {
    render(ui());
    expect(button().hasAttribute("aria-describedby")).toBe(false);
    focus();
    expect(tip()?.id).toBeTruthy();
    expect(button().getAttribute("aria-describedby")).toBe(tip()?.id);
    blur();
    expect(button().hasAttribute("aria-describedby")).toBe(false);
  });

  it("keeps the control's own description", () => {
    render(
      <Tooltip label="Save">
        <button aria-describedby="hint">Go</button>
      </Tooltip>,
    );
    expect(button().getAttribute("aria-describedby")).toBe("hint");
    focus();
    expect(button().getAttribute("aria-describedby")).toBe(`hint ${tip()?.id}`);
  });

  it("portals like a popover", () => {
    render(ui());
    focus();
    expect(tip()?.parentElement).toBe(fake.value.portalTarget);
  });

  it("without a target the control renders and no tooltip does", () => {
    fake.value = { ...fake.value, portalTarget: null };
    render(ui());
    expect(button()).not.toBeNull();
    focus();
    expect(tip()).toBeNull();
    expect(button().hasAttribute("aria-describedby")).toBe(false);
  });

  it("never takes the pointer", () => {
    render(ui());
    focus();
    expect(tip()?.classList.contains("pointer-events-none")).toBe(true);
    expect(tip()?.classList.contains("pointer-events-auto")).toBe(false);
  });

  it("sits above its control, centred, in screen units", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      left: 120,
      top: 260,
      width: 40,
      height: 20,
    } as DOMRect);
    render(ui({ gap: 4 }));
    focus();
    // Client (120, 260) is screen (200, 500) and 80 wide. The tooltip is
    // 200x100: x = 200 + 40 - 100, y = 500 - 100 - 4.
    expect(tip()?.style.left).toBe("140px");
    expect(tip()?.style.top).toBe("396px");
    expect(tip()?.style.visibility).toBe("visible");
  });
});
