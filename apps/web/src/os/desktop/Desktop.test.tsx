import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { staticContent } from "@/content/static";
import { Screen } from "@/os/screen/Screen";
import { os } from "@/os/store";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { Desktop } from "./Desktop";

function mount() {
  return render(
    <Screen>
      <Desktop>
        <div data-testid="layer" />
      </Desktop>
    </Screen>,
  );
}

const q = (selector: string) => document.querySelector<HTMLElement>(selector);

/** True when `b` comes after `a` in document order. */
const before = (a: Element, b: Element): boolean =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("Desktop", () => {
  beforeEach(() => {
    setupBrowser();
  });
  afterEach(teardownBrowser);

  it("follows the wallpaper setting", () => {
    mount();
    const image = () => q("[data-wallpaper]")?.style.backgroundImage;
    expect(q('[data-wallpaper="aubergine"]')).not.toBeNull();
    expect(image()).toBe('url("/wallpapers/aubergine.svg")');

    act(() => os.settings.update({ wallpaper: "orange" }));
    expect(q('[data-wallpaper="orange"]')).not.toBeNull();
    expect(image()).toBe('url("/wallpapers/orange.svg")');

    act(() => os.settings.update({ wallpaper: "mono" }));
    expect(q('[data-wallpaper="mono"]')).not.toBeNull();
    expect(image()).toBe('url("/wallpapers/mono.svg")');
    expect(document.querySelectorAll("[data-wallpaper]")).toHaveLength(1);
  });

  it("puts the wallpaper and the signature under the windows", () => {
    mount();
    expect(document.querySelectorAll('[data-testid="layer"]')).toHaveLength(1);
    const layer = q('[data-testid="layer"]')!;
    const wallpaper = q("[data-wallpaper]")!;
    const signature = q("[data-signature]")!;
    expect(before(wallpaper, layer)).toBe(true);
    expect(before(signature, layer)).toBe(true);

    // The root adds nothing to the stacking: the layer is isolate, and a
    // z-index or isolate here would change what paints above the windows.
    const root = wallpaper.parentElement!;
    expect(root.contains(layer)).toBe(true);
    expect(root.style.zIndex).toBe("");
    expect(root.className).not.toMatch(/(^|\s)(isolate|-?z-\S+)/);
  });

  it("keeps the app launcher", () => {
    mount();
    expect(q('nav[aria-label="Apps"]')).not.toBeNull();
  });

  describe("the signature", () => {
    it("shows the name and tagline from the content package", () => {
      mount();
      const signature = q("[data-signature]")!;
      const { name, tagline } = staticContent.profile();
      expect(signature.textContent).toContain(name);
      expect(signature.textContent).toContain(tagline);
      // Real text, and the desktop's right-click must reach what is under it.
      expect(signature.closest("[aria-hidden=true]")).toBeNull();
      expect(signature.className).toContain("pointer-events-none");
    });

    it("sits 24 px from the bottom in laptop mode", () => {
      mount();
      expect(q("[data-signature]")!.style.bottom).toBe("24px");
    });

    it("rises to 88 px in fullscreen mode, above the bottom dock", () => {
      teardownBrowser();
      setupBrowser({ fullscreen: true });
      mount();
      expect(q("[data-signature]")!.style.bottom).toBe("88px");
    });
  });
});
