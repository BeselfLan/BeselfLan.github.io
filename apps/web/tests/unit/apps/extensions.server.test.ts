// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

describe("extensions on the server", () => {
  it("imports and registers with no window or document", async () => {
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const { contextMenus, topBar } = await import("@/os/apps/extensions");
    const off = [
      contextMenus.register("desktop", []),
      topBar.registerTrayItem({ id: "x", label: "x", render: () => null }),
    ];
    expect(topBar.listTrayItems()).toHaveLength(1);
    off.forEach((f) => f());
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
