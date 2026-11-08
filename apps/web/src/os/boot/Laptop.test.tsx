import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Laptop } from "@/os/screen/Laptop";
import { Screen } from "@/os/screen/Screen";
import { os, useOS } from "@/os/store";
import { stubMedia } from "../../../tests/unit/helpers/browser";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { FULLSCREEN_QUERY } from "./mode";
import { REDUCED_QUERY } from "./reducedMotion";
import type { BootStage } from "./stages";

// The tree in the browser is the real Screen, so a remount shows in the count.
let mounts = 0;
function Counter() {
  useEffect(() => {
    mounts++;
  }, []);
  return <i data-counter="" />;
}

let media: ReturnType<typeof stubMedia>;

beforeEach(() => {
  mounts = 0;
  setupBrowser();
  // setupBrowser does not hand back its media stub, so stub again to flip it.
  media = stubMedia(false);
});
afterEach(() => {
  teardownBrowser();
});

const setStage = (stage: BootStage) =>
  act(() => {
    useOS.setState((s) => {
      s.boot.stage = stage;
    });
  });

function mount() {
  return render(
    <Laptop>
      <Screen>
        <Counter />
      </Screen>
    </Laptop>,
  );
}

const q = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const laptop = () => q("[data-laptop]");
const lid = () => q("[data-laptop-lid]");
const camera = () => q("[data-laptop-camera]");
// jsdom leaves the transform of an identity pose as "" or as "none".
const flatTransform = (el: HTMLElement) =>
  expect(["", "none"]).toContain(el.style.transform);

describe("children mount once", () => {
  it("survives the stages and a flip to fullscreen and back", () => {
    mount();
    expect(mounts).toBe(1);

    setStage("lid-opening");
    setStage("power-on");
    setStage("desktop");
    expect(mounts).toBe(1);

    act(() => media.set(true));
    expect(laptop().getAttribute("data-mode")).toBe("fullscreen");
    expect(mounts).toBe(1);

    act(() => media.set(false));
    expect(laptop().getAttribute("data-mode")).toBe("laptop");
    expect(mounts).toBe(1);
  });

  it("keeps the same screen element, not an equal one", () => {
    mount();
    const before = q("[data-screen-box]");
    act(() => media.set(true));
    expect(q("[data-screen-box]")).toBe(before);
  });
});

describe("closed at off", () => {
  it("tips the lid over the deck and keeps the 3D context", () => {
    mount();
    expect(laptop().getAttribute("data-lid")).toBe("closed");
    expect(laptop().getAttribute("data-mode")).toBe("laptop");
    expect(laptop().style.perspective).not.toBe("");
    expect(lid().style.transform).toMatch(/rotateX\(-\d+deg\)/);
    expect(camera().style.transformStyle).toBe("preserve-3d");
    expect(lid().style.transformStyle).toBe("preserve-3d");
  });

  it("shows the deck, the lid back and the lip", () => {
    mount();
    for (const part of ["deck", "lid-back", "lip"]) {
      expect(q(`[data-laptop-${part}]`).hasAttribute("hidden")).toBe(false);
    }
  });

  it("keeps the bezel's padding, so the fullscreen check means something", () => {
    mount();
    expect(q("[data-laptop-bezel]").style.padding).toBe(
      "var(--boot-laptop-bezel)",
    );
    expect(q("[data-laptop-webcam]").hasAttribute("hidden")).toBe(false);
  });

  it("hides the decoration from assistive technology", () => {
    mount();
    for (const part of ["deck", "lid-back", "lip", "webcam"]) {
      expect(q(`[data-laptop-${part}]`).getAttribute("aria-hidden")).toBe(
        "true",
      );
    }
    // The screen, with the page's content, is not hidden.
    expect(q("[data-laptop-screen]").closest("[aria-hidden]")).toBeNull();
  });

  it("is the closed laptop in every stage before the lid moves", () => {
    mount();
    setStage("lid-opening");
    expect(laptop().getAttribute("data-lid")).toBe("opening");
  });
});

describe("open and flat once settled", () => {
  it("has no perspective, no 3D context and no transform", () => {
    useOS.setState((s) => {
      s.boot.stage = "power-on";
    });
    mount();
    expect(laptop().getAttribute("data-lid")).toBe("open");
    expect(laptop().style.perspective).toBe("");
    flatTransform(lid());
    flatTransform(camera());
    expect(lid().style.transformStyle).toBe("");
    expect(camera().style.transformStyle).toBe("");
  });

  it("hides the deck and the lid back, and keeps the lip", () => {
    useOS.setState((s) => {
      s.boot.stage = "power-on";
    });
    mount();
    expect(q("[data-laptop-deck]").hasAttribute("hidden")).toBe(true);
    expect(q("[data-laptop-lid-back]").hasAttribute("hidden")).toBe(true);
    expect(q("[data-laptop-lip]").hasAttribute("hidden")).toBe(false);
  });

  it("goes flat when the stage leaves lid-opening", () => {
    mount();
    setStage("lid-opening");
    expect(laptop().style.perspective).not.toBe("");
    setStage("power-on");
    expect(laptop().getAttribute("data-lid")).toBe("open");
    expect(laptop().style.perspective).toBe("");
    expect(camera().style.transformStyle).toBe("");
    expect(q("[data-laptop-deck]").hasAttribute("hidden")).toBe(true);
  });

  it("stays open through a restart", () => {
    useOS.setState((s) => {
      s.boot.stage = "desktop";
    });
    mount();
    setStage("restarting");
    expect(laptop().getAttribute("data-lid")).toBe("open");
    expect(laptop().style.perspective).toBe("");
  });
});

describe("fullscreen is only the screen", () => {
  beforeEach(() => {
    media = stubMedia(true);
  });

  it("is open and flat even at off, with no bezel and no extras", () => {
    mount();
    expect(laptop().getAttribute("data-mode")).toBe("fullscreen");
    expect(laptop().getAttribute("data-lid")).toBe("open");
    for (const part of ["lip", "deck", "lid-back", "webcam"]) {
      expect(q(`[data-laptop-${part}]`).hasAttribute("hidden")).toBe(true);
    }
    expect(laptop().style.perspective).toBe("");
    flatTransform(lid());
    flatTransform(camera());
    expect(["", "0px"]).toContain(q("[data-laptop-bezel]").style.padding);
  });

  it("stays flat through the boot stages", () => {
    mount();
    setStage("lid-opening");
    expect(laptop().getAttribute("data-lid")).toBe("open");
    expect(laptop().style.perspective).toBe("");
  });

  it("gets its bezel back in laptop mode", () => {
    mount();
    act(() => media.set(false));
    expect(q("[data-laptop-bezel]").style.padding).toBe(
      "var(--boot-laptop-bezel)",
    );
    expect(q("[data-laptop-lip]").hasAttribute("hidden")).toBe(false);
  });
});

describe("the power button", () => {
  const button = () =>
    document.querySelector<HTMLElement>("[data-power-button]");
  const shutDown = () =>
    useOS.setState((s) => {
      s.boot.mode = "fast";
      s.boot.stage = "off";
      s.boot.startedAt = 123;
    });

  it("is not there before the first boot", () => {
    mount();
    expect(useOS.getState().boot.stage).toBe("off");
    expect(useOS.getState().boot.startedAt).toBeNull();
    expect(button()).toBeNull();
  });

  it("is not there during or after a boot", () => {
    mount();
    setStage("lid-opening");
    expect(button()).toBeNull();
    setStage("desktop");
    expect(button()).toBeNull();
    setStage("shutting-down");
    expect(button()).toBeNull();
  });

  it("after a shutdown it shows, takes focus and powers on in full", () => {
    shutDown();
    mount();
    const power = button()!;
    expect(power).not.toBeNull();
    expect(power.textContent).toBe("Power on");
    expect(document.activeElement).toBe(power);
    // The wait is the lid's closing time, and the button is outside the camera.
    expect(power.style.animationDelay).toBe("800ms");
    expect(power.closest("[data-laptop-camera]")).toBeNull();
    expect(laptop().lastElementChild).toBe(power);

    act(() => power.click());
    expect(useOS.getState().boot.stage).toBe("lid-opening");
    // Fails with start("fast") and with send("powerOn"), which keep "fast".
    expect(useOS.getState().boot.mode).toBe("full");
    expect(button()).toBeNull();
  });

  it("comes after the Power Off that closed the lid", () => {
    useOS.setState((s) => {
      s.boot.stage = "desktop";
      s.boot.startedAt = 123;
    });
    mount();
    expect(button()).toBeNull();
    act(() => os.boot.shutdown());
    expect(button()).toBeNull();
    setStage("off");
    expect(laptop().getAttribute("data-lid")).toBe("closed");
    expect(button()).not.toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it("is a real button with an accessible name", () => {
    shutDown();
    mount();
    const power = button()!;
    expect(power.tagName).toBe("BUTTON");
    expect(power.getAttribute("type")).toBe("button");
    expect(power.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("shows at once in fullscreen", () => {
    media = stubMedia(true);
    shutDown();
    mount();
    expect(laptop().getAttribute("data-mode")).toBe("fullscreen");
    expect(button()!.style.animationDelay).toBe("0ms");
  });

  it("shows at once in fullscreen when only the fullscreen query matches", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q === FULLSCREEN_QUERY,
      addEventListener() {},
      removeEventListener() {},
    }));
    shutDown();
    mount();
    expect(laptop().getAttribute("data-mode")).toBe("fullscreen");
    expect(button()!.style.animationDelay).toBe("0ms");
  });

  it("shows at once under reduced motion in laptop mode", () => {
    os.settings.update({ reducedMotion: "on" });
    shutDown();
    mount();
    expect(laptop().getAttribute("data-mode")).toBe("laptop");
    expect(button()!.style.animationDelay).toBe("0ms");
  });

  it("waits for the lid when the system asks for less but the setting is off", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q === REDUCED_QUERY,
      addEventListener() {},
      removeEventListener() {},
    }));
    os.settings.update({ reducedMotion: "off" });
    shutDown();
    mount();
    expect(button()!.style.animationDelay).toBe("800ms");
  });
});
