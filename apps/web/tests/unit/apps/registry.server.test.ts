// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

describe("the registry on the server", () => {
  it("imports with no window or document", async () => {
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");

    const { apps, dockApps, gridApps, chromeOf } =
      await import("@/os/apps/registry");
    expect(apps.map((a) => a.id)).toEqual([
      "projects",
      "skills",
      "video-player",
      "about",
      "hello",
    ]);
    expect(dockApps).toHaveLength(3);
    expect(gridApps).toHaveLength(4);
    expect(chromeOf("about")).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
