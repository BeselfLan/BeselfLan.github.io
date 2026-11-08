// @vitest-environment node
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Laptop } from "@/os/screen/Laptop";

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the server render is the closed laptop", () => {
  it("holds the closed lid, the child and a tipped lid", () => {
    const html = renderToString(
      <Laptop>
        <i data-child="" />
      </Laptop>,
    );
    expect(html).toContain('data-lid="closed"');
    expect(html).toContain('data-mode="laptop"');
    expect(html).toContain("data-child");
    expect(html).toContain("rotateX(");
    expect(html).toContain("perspective");
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("has no power button: that comes only after a shutdown", () => {
    const html = renderToString(<Laptop>{null}</Laptop>);
    expect(html).not.toContain("data-power-button");
    expect(html).not.toContain("Power on");
  });

  it("draws the deck and the lid back, which the settled laptop hides", () => {
    const html = renderToString(<Laptop>{null}</Laptop>);
    expect(html).toContain("data-laptop-deck");
    expect(html).toContain("data-laptop-lid-back");
    // The hidden attribute, which React prints as hidden="", is on nothing.
    expect(html).not.toContain('hidden=""');
  });
});
