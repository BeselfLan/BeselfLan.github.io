// @vitest-environment node
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BootSequence } from "./BootSequence";
import { buildBootScript } from "./bootScript";

// The same pass-through as the jsdom test: the real function, but a spy.
vi.mock("./bootScript", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./bootScript")>();
  return { ...actual, buildBootScript: vi.fn(actual.buildBootScript) };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BootSequence on the server", () => {
  it("the server render is the off screen", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");

    // react-dom/server may read the clock itself, so measure what an empty
    // render costs and compare against that.
    renderToString(<div />);
    const baseline = {
      random: random.mock.calls.length,
      now: now.mock.calls.length,
    };
    random.mockClear();
    now.mockClear();
    vi.mocked(buildBootScript).mockClear();

    const html = renderToString(<BootSequence />);

    expect(html).toContain('data-boot-stage="off"');
    expect(html).not.toContain("data-boot-line");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Skip");
    // The region is in the markup from the start, empty.
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(html).toMatch(/<p aria-live="polite"[^>]*><\/p>/);

    expect(buildBootScript).not.toHaveBeenCalled();
    expect(random).toHaveBeenCalledTimes(baseline.random);
    expect(now).toHaveBeenCalledTimes(baseline.now);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("starts nothing: the store is still off after the render", async () => {
    const { useOS } = await import("@/os/store");
    renderToString(<BootSequence />);
    expect(useOS.getState().boot.stage).toBe("off");
    expect(useOS.getState().boot.bootLogMs).toBe(0);
  });
});
