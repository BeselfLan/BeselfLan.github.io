import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { os } from "@/os/store";
import type { Settings } from "@/os/store/settings";
import { registerIconRectGetter } from "@/os/window/iconRect";
import {
  frameOf,
  mountLayer,
  open,
  register,
  setupBrowser,
  teardownBrowser,
} from "./mountLayer";

// In its own file: motion reads the system preference once per module graph,
// when it first needs it, and the shared stubMedia answers every query alike.
// This stub answers per query, so the system asks to reduce motion while the
// screen stays in laptop mode.

let unregister: (() => void) | null = null;

beforeEach(() => {
  setupBrowser();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: /prefers-reduced-motion/.test(query),
    addEventListener() {},
    removeEventListener() {},
  }));
  unregister = registerIconRectGetter(() => ({
    left: 100,
    top: 400,
    width: 48,
    height: 48,
  }));
});
afterEach(() => {
  unregister?.();
  unregister = null;
  teardownBrowser();
});

const surface = (id: string) => frameOf(id)!.firstElementChild as HTMLElement;

async function openAndMinimise(setting: Settings["reducedMotion"]) {
  act(() => os.settings.update({ reducedMotion: setting }));
  register({ id: "a" });
  mountLayer();
  open("a");
  const entering = surface("a").style.transform;
  await waitFor(() => expect(surface("a").style.opacity).toBe("1"));
  act(() => os.windows.minimizeWindow("a"));
  await waitFor(() => expect(frameOf("a")!.style.visibility).toBe("hidden"));
  return { entering, minimised: surface("a").style.transform };
}

describe("reduced motion", () => {
  it.each(["on", "system"] as const)(
    "reduced motion is honoured, %s: windows only fade",
    async (setting) => {
      const { entering, minimised } = await openAndMinimise(setting);
      expect(entering).not.toContain("scale(0.96)");
      expect(minimised).not.toMatch(/translate|scale/);
    },
  );

  it("off plays them with the system preference set to reduce", async () => {
    const { entering, minimised } = await openAndMinimise("off");
    expect(entering).toContain("scale(0.96)");
    expect(minimised).toContain("translateX(");
    expect(minimised).toContain("scale(");
  });
});
