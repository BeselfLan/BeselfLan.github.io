import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { os, useOS } from "@/os/store";
import {
  setupBrowser,
  teardownBrowser,
} from "../../../tests/unit/window/mountLayer";
import { BootSequence } from "./BootSequence";
import { BOOTED_KEY } from "./mode";
import { REDUCED_QUERY } from "./reducedMotion";
import {
  bootLogDuration,
  buildBootScript,
  type BootGroup,
  type BootLine,
} from "./bootScript";

// The component on its own, on fake setTimeout and clearTimeout only, so a
// flush in act moves one stage: each stage sets the next timer in an effect.
// buildBootScript is wrapped, not replaced, so a test reads the script that
// the component really built and never hand-builds the expected one.

vi.mock("./bootScript", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./bootScript")>();
  return { ...actual, buildBootScript: vi.fn(actual.buildBootScript) };
});

const boot = () => useOS.getState().boot;
const stage = () => boot().stage;
const root = () => document.querySelector<HTMLElement>("[data-boot-stage]");
const lineEls = () => document.querySelectorAll("[data-boot-line]");
const skipButton = () => screen.queryByRole("button", { name: "Skip" });

const walk = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** The script the component built last. */
function built(): BootLine[] {
  const results = vi.mocked(buildBootScript).mock.results;
  return results.at(-1)!.value as BootLine[];
}

/** When each line prints, in ms from the start of boot-log. */
function cumulative(script: readonly BootLine[]): number[] {
  let at = 0;
  return script.map((l) => (at += l.delayMs));
}

/** The one live region, found the way a screen reader would find it. */
function liveRegions(): Element[] {
  const r = root()!;
  return [r, ...r.querySelectorAll("*")].filter((el) => {
    const live = el.getAttribute("aria-live");
    return live !== null && live !== "off";
  });
}

const STAGES_BEFORE_LOG = [
  ["lid-opening", 1000],
  ["power-on", 300],
  ["firmware", 500],
] as const;

/** Mount, then walk the three fixed stages in front of boot-log. */
function toBootLog(): void {
  for (const [name, ms] of STAGES_BEFORE_LOG) {
    expect(stage()).toBe(name);
    walk(ms);
  }
  expect(stage()).toBe("boot-log");
}

function toDesktop(): void {
  for (let i = 0; i < 12 && stage() !== "desktop"; i++)
    walk(boot().bootLogMs + 2000);
  expect(stage()).toBe("desktop");
}

beforeEach(() => {
  setupBrowser();
  // setupBrowser clears only localStorage, and jsdom keeps sessionStorage
  // across the tests in a file, so a flag written by one test would make the
  // next one a fast boot. The URL is reset for the same reason.
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.mocked(buildBootScript).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  teardownBrowser();
});

describe("BootSequence", () => {
  it("starts a full boot on mount", () => {
    expect(stage()).toBe("off");
    render(<BootSequence />);
    expect(stage()).toBe("lid-opening");
    expect(boot().mode).toBe("full");
  });

  it("each stage lasts its 3.2 duration", () => {
    render(<BootSequence />);
    const logMs = boot().bootLogMs;
    expect(logMs).toBeGreaterThanOrEqual(2200);
    expect(logMs).toBeLessThanOrEqual(2600);
    expect(logMs).toBe(bootLogDuration(built()));

    const walkOfStages = [
      ["lid-opening", 1000, "power-on"],
      ["power-on", 300, "firmware"],
      ["firmware", 500, "boot-log"],
      ["boot-log", logMs, "desktop-enter"],
      ["desktop-enter", 400, "desktop"],
    ] as const;
    for (const [name, ms, next] of walkOfStages) {
      expect(stage()).toBe(name);
      walk(ms - 1);
      expect(stage(), `${name} after ${ms - 1} ms`).toBe(name);
      walk(1);
      expect(stage(), `${name} after ${ms} ms`).toBe(next);
    }
    expect(stage()).toBe("desktop");
  });

  it("every boot supplies bootLogMs", () => {
    render(<BootSequence />);
    toDesktop();
    expect(vi.mocked(buildBootScript)).toHaveBeenCalledTimes(1);

    // As after a first boot in skip mode, which never built a length.
    act(() => {
      useOS.setState((s) => {
        s.boot.bootLogMs = 0;
      });
    });
    act(() => os.boot.restart());
    expect(stage()).toBe("restarting");
    expect(vi.mocked(buildBootScript)).toHaveBeenCalledTimes(2);
    const logMs = bootLogDuration(built());
    expect(logMs).toBeGreaterThan(0);
    expect(boot().bootLogMs).toBe(logMs);

    walk(600);
    expect(stage()).toBe("power-on");
    walk(300);
    expect(stage()).toBe("firmware");
    walk(500);
    expect(stage()).toBe("boot-log");
    expect(boot().bootLogMs).toBe(logMs);
    walk(logMs - 1);
    expect(stage()).toBe("boot-log");
    walk(1);
    expect(stage()).toBe("desktop-enter");
  });

  it("lines print over time", () => {
    render(<BootSequence />);
    toBootLog();
    const script = built();
    const at = cumulative(script);
    const total = at[at.length - 1];
    expect(lineEls()).toHaveLength(0);
    expect(boot().lineIndex).toBe(0);

    // Every instant a line prints, except the last, which shares its instant
    // with the end of the stage.
    const instants = [...new Set(at.slice(0, -1))];
    let now = 0;
    let shown = 0;
    for (const t of instants) {
      if (t - now >= 1) {
        walk(t - now - 1);
        expect(lineEls(), `at ${t - 1} ms`).toHaveLength(shown);
        expect(boot().lineIndex).toBe(shown);
        walk(1);
      } else {
        walk(t - now);
      }
      now = t;
      shown = at.filter((x) => x <= t).length;
      expect(lineEls(), `at ${t} ms`).toHaveLength(shown);
      expect(boot().lineIndex, `at ${t} ms`).toBe(shown);
    }
    expect(shown).toBeLessThan(script.length);
    expect(stage()).toBe("boot-log");

    // The stage ends on its own timer and the last line is on the screen.
    walk(total - now);
    expect(stage()).toBe("desktop-enter");
    expect(lineEls()).toHaveLength(script.length);
    expect(boot().lineIndex).toBe(script.length);
    expect(lineEls()[script.length - 1].textContent).toMatch(
      /Reached target BeselfOS Desktop$/,
    );
  });

  it("Skip", () => {
    render(<BootSequence />);
    expect(skipButton()).toBeNull(); // lid-opening
    walk(1000);
    expect(stage()).toBe("power-on");
    expect(skipButton()).toBeNull();
    walk(300);
    expect(stage()).toBe("firmware");
    expect(skipButton()).not.toBeNull();
    walk(500);
    expect(stage()).toBe("boot-log");
    expect(skipButton()).not.toBeNull();

    const at = cumulative(built());
    walk(at[4]);
    const printed = lineEls().length;
    expect(printed).toBeGreaterThanOrEqual(5);
    expect(printed).toBeLessThan(built().length);

    fireEvent.click(skipButton()!);
    expect(stage()).toBe("desktop-enter");
    expect(skipButton()).toBeNull();

    // The log stops where it was, while the stage fades.
    walk(300);
    expect(stage()).toBe("desktop-enter");
    expect(lineEls()).toHaveLength(printed);
    expect(boot().lineIndex).toBe(printed);
    walk(100);
    expect(stage()).toBe("desktop");
  });

  it("a line due before the cleanup does not print after the stage moved on", () => {
    render(<BootSequence />);
    toBootLog();
    const at = cumulative(built());
    walk(at[4]);
    const printed = boot().lineIndex;

    // One act: React does not run the effect cleanup between the skip and the
    // timers, so the line timers are still armed when they come due.
    act(() => {
      os.boot.skip();
      vi.advanceTimersByTime(at[9] - at[4]);
    });
    expect(stage()).toBe("desktop-enter");
    expect(boot().lineIndex).toBe(printed);
    expect(lineEls()).toHaveLength(printed);
  });

  it("Skip in firmware leaves an empty log to fade", () => {
    render(<BootSequence />);
    walk(1000);
    walk(300);
    expect(stage()).toBe("firmware");
    fireEvent.click(skipButton()!);
    expect(stage()).toBe("desktop-enter");
    expect(lineEls()).toHaveLength(0);
    walk(400);
    expect(stage()).toBe("desktop");
  });

  it("one polite live region, holding the newest header", () => {
    render(<BootSequence />);
    // The region is there from the first render, with nothing in it.
    expect(liveRegions()).toHaveLength(1);
    const region = liveRegions()[0];
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");

    toBootLog();
    const script = built();
    const at = cumulative(script);
    const line = (pred: (l: BootLine) => boolean, nth = 1) => {
      const hits = script.flatMap((l, i) => (pred(l) ? [i] : []));
      return hits[nth - 1];
    };
    const inGroup = (group: BootGroup) => (l: BootLine) =>
      l.group === group && l.status === "ok";
    let now = 0;
    const printTo = (index: number) => {
      walk(at[index] - now);
      now = at[index];
    };
    const check = () => {
      expect(liveRegions()).toEqual([region]);
      expect(
        root()!.querySelectorAll(
          '[role="log"], [role="status"], [role="alert"]',
        ),
      ).toHaveLength(0);
    };

    // Only flavour lines so far: nothing to say.
    const firstHeader = line((l) => l.status === "header");
    expect(firstHeader).toBeGreaterThan(0);
    printTo(firstHeader - 1);
    expect(lineEls()).toHaveLength(firstHeader);
    expect(region.textContent).toBe("");
    check();

    // The header printing is what changes it, and it holds through its lines.
    printTo(firstHeader);
    expect(region.textContent).toBe("Loading my projects...");
    printTo(line(inGroup("projects")));
    expect(region.textContent).toBe("Loading my projects...");

    const languages = line(
      (l) => l.status === "header" && l.group === "languages",
    );
    printTo(languages - 1);
    expect(region.textContent).not.toBe("Loading languages...");
    printTo(languages);
    expect(region.textContent).toBe("Loading languages...");
    printTo(line(inGroup("languages"), 2));
    expect(region.textContent).toBe("Loading languages...");
    check();

    // It is the same element all the way, so the screen reader sees changes.
    expect(liveRegions()[0]).toBe(region);
    // The visual log carries no live attribute of its own.
    expect(
      document.querySelector("[data-boot-log]")?.hasAttribute("aria-live"),
    ).toBe(false);
  });

  it("keeps the region at every stage", () => {
    render(<BootSequence />);
    for (const [name, ms] of STAGES_BEFORE_LOG) {
      expect(stage()).toBe(name);
      expect(liveRegions()).toHaveLength(1);
      walk(ms);
    }
    walk(boot().bootLogMs);
    expect(stage()).toBe("desktop-enter");
    expect(liveRegions()).toHaveLength(1);
    // The last header is still there while the log fades.
    expect(liveRegions()[0].textContent).toBe("Loading hobbies...");
  });

  it("desktop-enter lets the pointer through", () => {
    render(<BootSequence />);
    toBootLog();
    expect(root()!.style.pointerEvents).not.toBe("none");
    walk(boot().bootLogMs);
    expect(stage()).toBe("desktop-enter");
    expect(root()!.style.pointerEvents).toBe("none");
    // Pointer events are inherited, so nothing inside may turn them back on.
    expect(root()!.querySelector('[class*="pointer-events-auto"]')).toBeNull();
  });

  it("durations come from the table", () => {
    render(<BootSequence />);
    walk(1000);
    expect(stage()).toBe("power-on");
    const layers = [...root()!.querySelectorAll<HTMLElement>("[aria-hidden]")];
    expect(layers.length).toBeGreaterThan(0);
    expect(layers.map((l) => l.style.animationDuration)).toEqual(
      layers.map(() => "300ms"),
    );

    walk(300);
    expect(stage()).toBe("firmware");
    const bar = root()!.querySelector<HTMLElement>("[data-boot-progress]");
    expect(bar?.style.animationDuration).toBe("500ms");
    expect(root()!.style.animationDuration).toBe("");

    walk(500);
    walk(boot().bootLogMs);
    expect(stage()).toBe("desktop-enter");
    expect(root()!.style.animationDuration).toBe("400ms");
  });

  it("the printed log is aria-hidden and the firmware screen is decoration", () => {
    render(<BootSequence />);
    walk(1000);
    walk(300);
    expect(
      root()!.querySelector("[data-boot-progress]")?.closest("[aria-hidden]"),
    ).not.toBeNull();
    walk(500);
    expect(
      document.querySelector("[data-boot-log]")?.getAttribute("aria-hidden"),
    ).toBe("true");
    // The root itself stays exposed: the Skip button and the region are in it.
    expect(root()!.hasAttribute("aria-hidden")).toBe(false);
    expect(skipButton()).not.toBeNull();
  });

  it("nothing on the desktop", () => {
    render(<BootSequence />);
    toDesktop();
    expect(root()).toBeNull();
    expect(skipButton()).toBeNull();
    expect(lineEls()).toHaveLength(0);
    expect(document.querySelector("[aria-live]")).toBeNull();
  });

  it("stops every timer when it unmounts", () => {
    const { unmount } = render(<BootSequence />);
    toBootLog();
    walk(500);
    const printed = boot().lineIndex;
    expect(printed).toBeGreaterThan(0);
    unmount();
    walk(10_000);
    expect(stage()).toBe("boot-log");
    expect(boot().lineIndex).toBe(printed);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("plays one boot under Strict Mode, whose effects run twice", () => {
    render(
      <StrictMode>
        <BootSequence />
      </StrictMode>,
    );
    expect(stage()).toBe("lid-opening");
    // The second build wins and bootLogMs follows it.
    expect(boot().bootLogMs).toBe(bootLogDuration(built()));
    toBootLog();
    walk(boot().bootLogMs - 1);
    expect(stage()).toBe("boot-log");
    walk(1);
    expect(stage()).toBe("desktop-enter");
    expect(lineEls()).toHaveLength(built().length);
    walk(400);
    expect(stage()).toBe("desktop");
  });
});

/** A key press and a pointer press, as the listeners hear them. */
const press = {
  key: () => fireEvent.keyDown(window, { key: " " }),
  pointer: () => fireEvent.pointerDown(document.body),
};

/** Mount, then walk lid-opening and power-on: each walk moves one stage. */
function toFirmware(): void {
  walk(1000);
  walk(300);
  expect(stage()).toBe("firmware");
}

/** Fast and skip boots have 0 ms stages, and each stage sets the next timer. */
function walkZero(until: string): void {
  for (let i = 0; i < 12 && stage() !== until; i++) walk(0);
  expect(stage()).toBe(until);
}

describe("skipping by any key or press", () => {
  it.each([
    ["a key", "firmware", press.key],
    ["a key", "boot-log", press.key],
    ["a press", "firmware", press.pointer],
    ["a press", "boot-log", press.pointer],
  ] as const)("%s in %s skips", (_, at, doPress) => {
    render(<BootSequence />);
    if (at === "firmware") {
      toFirmware();
    } else {
      toBootLog();
      walk(700);
    }
    expect(stage()).toBe(at);
    doPress();
    expect(stage()).toBe("desktop-enter");
    walk(400);
    expect(stage()).toBe("desktop");
  });

  it("a key in boot-log stops the log where it was", () => {
    render(<BootSequence />);
    toBootLog();
    walk(cumulative(built())[4]);
    const printed = lineEls().length;
    expect(printed).toBeGreaterThan(0);
    press.key();
    walk(300);
    expect(lineEls()).toHaveLength(printed);
  });

  it("nothing else is listening", () => {
    const skip = vi.spyOn(os.boot, "skip");
    const { unmount } = render(<BootSequence />);
    const heard = (name: string) => {
      press.key();
      press.pointer();
      expect(skip, `at ${name}`).not.toHaveBeenCalled();
    };
    heard("lid-opening");
    walk(1000);
    expect(stage()).toBe("power-on");
    heard("power-on");
    walk(300);
    walk(500);
    expect(stage()).toBe("boot-log");
    walk(boot().bootLogMs);
    expect(stage()).toBe("desktop-enter");
    heard("desktop-enter");
    walk(400);
    expect(stage()).toBe("desktop");
    heard("desktop");
    unmount();
    heard("unmount");
    skip.mockRestore();
  });

  it("stops listening once the skip has happened", () => {
    const skip = vi.spyOn(os.boot, "skip");
    render(<BootSequence />);
    toFirmware();
    press.key();
    expect(skip).toHaveBeenCalledTimes(1);
    expect(stage()).toBe("desktop-enter");
    // The listener went with the stage: a second press is not heard.
    press.key();
    press.pointer();
    expect(skip).toHaveBeenCalledTimes(1);
    skip.mockRestore();
  });

  it("does not stop a key's default action", () => {
    render(<BootSequence />);
    toFirmware();
    const event = new KeyboardEvent("keydown", {
      key: "r",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(stage()).toBe("desktop-enter");
  });

  it("the firmware screen promises the key", () => {
    render(<BootSequence />);
    walk(1000);
    expect(stage()).toBe("power-on");
    expect(screen.queryByText("Press any key to skip")).toBeNull();
    walk(300);
    expect(stage()).toBe("firmware");
    expect(screen.getByText("Press any key to skip")).toBeTruthy();
    walk(500);
    expect(stage()).toBe("boot-log");
    expect(screen.queryByText("Press any key to skip")).toBeNull();
  });
});

describe("the mode a load picks", () => {
  it("?boot=skip lands on the desktop at once", () => {
    window.history.replaceState(null, "", "/?boot=skip");
    render(<BootSequence />);
    expect(boot().mode).toBe("skip");
    walkZero("desktop");
    expect(root()).toBeNull();
  });

  it("?boot=fast fades from black", () => {
    window.history.replaceState(null, "", "/?boot=fast");
    render(<BootSequence />);
    expect(boot().mode).toBe("fast");
    walkZero("desktop-enter");
    // Fails without the guard on the last line: the stage would draw the whole
    // log it skipped, and fade that out.
    expect(lineEls()).toHaveLength(0);
    expect(boot().lineIndex).toBe(0);
    expect(root()!.style.animationDuration).toBe("400ms");
    walk(399);
    expect(stage()).toBe("desktop-enter");
    expect(lineEls()).toHaveLength(0);
    walk(1);
    expect(stage()).toBe("desktop");
  });

  it("a deep link boots fast", () => {
    window.history.replaceState(null, "", "/?app=hello");
    render(<BootSequence />);
    expect(boot().mode).toBe("fast");
  });

  it("?boot=full beats a deep link and the session flag", () => {
    sessionStorage.setItem(BOOTED_KEY, "1");
    window.history.replaceState(null, "", "/?app=hello&boot=full");
    render(<BootSequence />);
    expect(boot().mode).toBe("full");
    expect(stage()).toBe("lid-opening");
    walk(999);
    expect(stage()).toBe("lid-opening");
  });

  it("the session flag is written at the desktop", () => {
    render(<BootSequence />);
    expect(sessionStorage.getItem(BOOTED_KEY)).toBeNull();
    toBootLog();
    walk(boot().bootLogMs);
    expect(stage()).toBe("desktop-enter");
    expect(sessionStorage.getItem(BOOTED_KEY)).toBeNull();
    walk(400);
    expect(stage()).toBe("desktop");
    expect(sessionStorage.getItem(BOOTED_KEY)).toBe("1");
  });

  it("a second load in the session is fast", () => {
    const first = render(<BootSequence />);
    expect(boot().mode).toBe("full");
    toDesktop();
    expect(sessionStorage.getItem(BOOTED_KEY)).toBe("1");
    first.unmount();

    act(() => {
      useOS.setState(useOS.getInitialState(), true);
    });
    render(<BootSequence />);
    expect(stage()).toBe("lid-opening");
    expect(boot().mode).toBe("fast");
    walkZero("desktop-enter");
    walk(400);
    expect(stage()).toBe("desktop");
  });

  it("a skip boot also writes the flag", () => {
    window.history.replaceState(null, "", "/?boot=skip");
    render(<BootSequence />);
    walkZero("desktop");
    expect(sessionStorage.getItem(BOOTED_KEY)).toBe("1");
  });

  it("a restart replays the full boot, not the mode the load picked", () => {
    window.history.replaceState(null, "", "/?boot=fast");
    render(<BootSequence />);
    walkZero("desktop-enter");
    walk(400);
    expect(boot().mode).toBe("fast");
    act(() => os.boot.restart());
    expect(boot().mode).toBe("full");
    expect(stage()).toBe("restarting");
  });
});

describe("reduced motion", () => {
  const toPowerOn = () => {
    // Forced full, so the 300 ms stage is there to look at.
    window.history.replaceState(null, "", "/?boot=full");
    render(<BootSequence />);
    walk(1000);
    expect(stage()).toBe("power-on");
  };
  const glow = () => document.querySelector(".boot-glow");
  const scanlines = () => document.querySelector(".boot-scanlines");
  const stubSystemReduces = () =>
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q === REDUCED_QUERY,
      addEventListener() {},
      removeEventListener() {},
    }));

  it("the default draws the animated glow and the scanlines", () => {
    toPowerOn();
    expect(glow()?.classList.contains("boot-glow-animated")).toBe(true);
    expect(scanlines()).not.toBeNull();
  });

  it("reduced motion draws no scanlines", () => {
    os.settings.update({ reducedMotion: "on" });
    toPowerOn();
    expect(scanlines()).toBeNull();
    expect(glow()).not.toBeNull();
    expect(glow()!.classList.contains("boot-glow-animated")).toBe(false);
  });

  it("follows the system query while the setting is 'system'", () => {
    stubSystemReduces();
    toPowerOn();
    expect(scanlines()).toBeNull();
    expect(glow()!.classList.contains("boot-glow-animated")).toBe(false);
  });

  it("'off' plays the effects even when the system asks for less", () => {
    stubSystemReduces();
    os.settings.update({ reducedMotion: "off" });
    toPowerOn();
    expect(scanlines()).not.toBeNull();
    expect(glow()!.classList.contains("boot-glow-animated")).toBe(true);
  });

  it("reduced motion on load is a fast boot", () => {
    os.settings.update({ reducedMotion: "on" });
    render(<BootSequence />);
    expect(boot().mode).toBe("fast");
  });

  it("keeps the firmware bar and the fade", () => {
    os.settings.update({ reducedMotion: "on" });
    window.history.replaceState(null, "", "/?boot=full");
    render(<BootSequence />);
    toFirmware();
    expect(document.querySelector("[data-boot-progress]")).not.toBeNull();
    walk(500);
    walk(boot().bootLogMs);
    expect(stage()).toBe("desktop-enter");
    expect(root()!.style.animationDuration).toBe("400ms");
  });
});

describe("the login stage", () => {
  it("is off by default", () => {
    render(<BootSequence />);
    const seen = new Set<string>([stage()]);
    for (let i = 0; i < 12 && stage() !== "desktop"; i++) {
      walk(boot().bootLogMs + 2000);
      seen.add(stage());
    }
    expect(stage()).toBe("desktop");
    expect(seen.has("login")).toBe(false);
  });
});
