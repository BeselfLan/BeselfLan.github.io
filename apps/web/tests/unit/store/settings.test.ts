import { beforeEach, describe, expect, it } from "vitest";
import { os, useOS } from "@/os/store";

beforeEach(() => {
  useOS.setState(useOS.getInitialState(), true);
});

describe("settings", () => {
  it("defaults match 2.2", () => {
    expect(useOS.getState().settings).toEqual({
      reducedMotion: "system",
      bootMode: "full",
      wallpaper: "aubergine",
      showLogin: false,
      sound: false,
      theme: "dark",
      persistLayout: false,
    });
  });

  it("update changes only what it names", () => {
    os.settings.update({ wallpaper: "mono" });
    os.settings.update({ bootMode: "fast" });
    const s = useOS.getState().settings;
    expect(s.wallpaper).toBe("mono");
    expect(s.bootMode).toBe("fast");
    expect(s.theme).toBe("dark");
  });
});
