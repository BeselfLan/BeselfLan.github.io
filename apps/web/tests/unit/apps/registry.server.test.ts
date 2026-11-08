// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const V1 = ["projects", "skills", "video-player", "about", "hello"];

describe("the registry on the server", () => {
  it("imports with no window or document", async () => {
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");

    const { apps, dockApps, gridApps, chromeOf } =
      await import("@/os/apps/registry");
    // The v1 apps first and in order; `npm run new-app` appends more.
    expect(apps.map((a) => a.id).slice(0, 5)).toEqual(V1);
    expect(dockApps.length).toBeGreaterThanOrEqual(3);
    expect(gridApps.length).toBeGreaterThanOrEqual(4);
    expect(chromeOf("about")).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
