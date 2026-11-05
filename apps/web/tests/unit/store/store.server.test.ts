// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

describe("store on the server", () => {
  it("runs with no window and no warnings", async () => {
    const warn = vi.spyOn(console, "warn");
    expect(typeof window).toBe("undefined");
    const { os, useOS } = await import("@/os/store");
    os.notifications.push({ title: "x" });
    os.settings.update({ wallpaper: "mono" });
    expect(useOS.getState().notifications.items).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
