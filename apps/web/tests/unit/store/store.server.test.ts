// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

describe("store on the server", () => {
  it("runs with no window and no warnings", async () => {
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    expect(typeof window).toBe("undefined");
    const { os, useOS, rehydrateSettings } = await import("@/os/store");
    // A real server never rehydrates, so writes are still disarmed here.
    os.notifications.push({ title: "before" });
    os.settings.update({ wallpaper: "orange" });
    expect(() => rehydrateSettings()).not.toThrow();
    os.notifications.push({ title: "x" });
    os.settings.update({ wallpaper: "mono" });
    expect(useOS.getState().notifications.items).toHaveLength(2);
    expect(useOS.getState().settings.wallpaper).toBe("mono");
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
