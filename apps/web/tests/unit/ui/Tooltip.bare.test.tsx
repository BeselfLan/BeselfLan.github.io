import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Tooltip } from "@/os/ui/Tooltip";

// No module mock here and no Screen around the render: the real
// `useOptionalScreen` finds no context.

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it("outside a Screen it renders its control and never shows", () => {
  render(
    <Tooltip label="x">
      <button>b</button>
    </Tooltip>,
  );
  const button = document.querySelector("button")!;
  expect(button.textContent).toBe("b");

  act(() => button.focus());
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(button.hasAttribute("aria-describedby")).toBe(false);

  act(() => button.blur());
  fireEvent.pointerEnter(button);
  act(() => void vi.advanceTimersByTime(1000));
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(button.hasAttribute("aria-describedby")).toBe(false);
});
