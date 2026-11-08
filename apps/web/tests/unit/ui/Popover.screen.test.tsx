import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Screen } from "@/os/screen/Screen";
import { Popover } from "@/os/ui/Popover";

// Inert stand-ins: nothing here resizes or changes the media query.
class InertResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", InertResizeObserver);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Popover under the real Screen", () => {
  it("portals inside the screen", () => {
    render(
      <Screen>
        <Popover
          open
          anchor={{ left: 10, top: 10, width: 0, height: 0 }}
          onClose={() => {}}
        >
          <span data-testid="content">hello</span>
        </Popover>
      </Screen>,
    );
    const content = document.querySelector("[data-testid=content]")!;
    const portal = document.querySelector("[data-screen-portal]")!;
    const box = document.querySelector("[data-screen-box]")!;
    expect(portal.contains(content)).toBe(true);
    expect(box.contains(content)).toBe(true);
    expect(content.closest("[data-popover]")?.parentElement).toBe(portal);
    // Not left directly under the body, outside the scaled box.
    expect(document.body.querySelector(":scope > [data-popover]")).toBeNull();
  });
});
