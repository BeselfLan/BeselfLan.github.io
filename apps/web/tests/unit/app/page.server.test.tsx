// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

describe("the page on the server", () => {
  it("renders the boot screen and no desktop", async () => {
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");

    const { default: Home } = await import("@/app/page");
    const html = renderToString(<Home />);

    expect(html).toContain('data-boot-stage="off"');
    expect(html).not.toContain("data-desktop");
    expect(html).not.toContain("data-window-id");
    expect(html).toMatch(/<h1[^>]*>BeselfOS/);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
