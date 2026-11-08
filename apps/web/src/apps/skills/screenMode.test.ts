import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FULLSCREEN_QUERY, useFullscreen } from "./screenMode";

// The guarded fullscreen flag. jsdom has no matchMedia, which is the reason the
// file exists (Screen's useScreenMode() would throw there).

function Probe() {
  return createElement("span", { "data-mode": "" }, String(useFullscreen()));
}
const mode = (c: HTMLElement) => c.querySelector("[data-mode]")?.textContent;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useFullscreen", () => {
  it("is false without matchMedia, and does not throw", () => {
    expect(typeof window.matchMedia).toBe("undefined");
    const { container } = render(createElement(Probe));
    expect(mode(container)).toBe("false");
  });

  it("follows the query", () => {
    let listener: (() => void) | null = null;
    const list = {
      matches: true,
      addEventListener: vi.fn((type: string, cb: () => void) => {
        if (type === "change") listener = cb;
      }),
      removeEventListener: vi.fn(),
    };
    const matchMedia = vi.fn(() => list);
    vi.stubGlobal("matchMedia", matchMedia);

    const { container, unmount } = render(createElement(Probe));
    expect(mode(container)).toBe("true");
    expect(matchMedia).toHaveBeenCalledWith(FULLSCREEN_QUERY);
    expect(listener).not.toBeNull();

    list.matches = false;
    act(() => listener?.());
    expect(mode(container)).toBe("false");

    unmount();
    expect(list.removeEventListener).toHaveBeenCalledWith("change", listener);
  });

  it("uses the same query as Screen", () => {
    const screen = readFileSync(
      join(import.meta.dirname, "../../os/screen/Screen.tsx"),
      "utf8",
    );
    expect(screen).toContain(JSON.stringify(FULLSCREEN_QUERY));
  });
});
