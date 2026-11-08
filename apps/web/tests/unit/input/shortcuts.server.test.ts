// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

describe("shortcuts on the server", () => {
  it("imports and registers with no window or document", async () => {
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const { shortcuts } = await import("@/os/input/shortcuts");
    const off = shortcuts.register("global", "Ctrl+K", () => {});
    off();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
