import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Laptop } from "@/os/screen/Laptop";
import { Screen } from "@/os/screen/Screen";
import { useOS } from "@/os/store";
import { stubMedia } from "../../../tests/unit/helpers/browser";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
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
