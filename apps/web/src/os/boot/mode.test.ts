import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { os, useOS } from "@/os/store";
import {
  BOOTED_KEY,
  chooseMode,
  FULLSCREEN_QUERY,
  initialMode,
  markBooted,
  type ModeInputs,
} from "./mode";
import { REDUCED_QUERY } from "./reducedMotion";

// Every input at its default is the full boot; a test then sets what it needs.
const NONE: ModeInputs = {
  search: "",
  booted: false,
  reducedMotion: false,
  fullscreen: false,
  bootMode: "full",
};
const mode = (over: Partial<ModeInputs>) => chooseMode({ ...NONE, ...over });

/** A matchMedia that answers true only for the queries in `on`. */
function stubQueries(on: readonly string[]) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: on.includes(q),
    addEventListener() {},
    removeEventListener() {},
  }));
}

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  useOS.setState(useOS.getInitialState(), true);
  stubQueries([]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chooseMode", () => {
  it("nothing set is a full boot", () => {
    expect(chooseMode(NONE)).toBe("full");
  });

  it.each<[string, Partial<ModeInputs>]>([
    ["a deep link", { search: "?app=hello" }],
    ["reduced motion", { reducedMotion: true }],
    ["a phone-sized screen", { fullscreen: true }],
    ["the session flag", { booted: true }],
    ["the saved fast mode", { bootMode: "fast" }],
  ])("%s alone makes it fast", (_, over) => {
    expect(mode(over)).toBe("fast");
  });

  it("?boot= wins over every other reason", () => {
    const everything: Partial<ModeInputs> = {
      booted: true,
      reducedMotion: true,
      fullscreen: true,
      bootMode: "fast",
    };
    expect(mode({ ...everything, search: "?boot=full&app=hello" })).toBe(
      "full",
    );
    expect(mode({ ...everything, search: "?boot=skip" })).toBe("skip");
    expect(mode({ search: "?boot=fast" })).toBe("fast");
  });

  it("?boot= works with or without the question mark", () => {
    expect(mode({ search: "boot=skip" })).toBe("skip");
    expect(mode({ search: "?app=hello&boot=full" })).toBe("full");
  });

  it("unknown values are ignored", () => {
    expect(mode({ search: "?boot=turbo" })).toBe("full");
    expect(mode({ search: "?app=" })).toBe("full");
    expect(mode({ search: "?boot=" })).toBe("full");
    // An unknown ?boot= does not hide the other reasons.
    expect(mode({ search: "?boot=turbo", booted: true })).toBe("fast");
  });
});

describe("initialMode reads the browser", () => {
  it("is full with nothing set", () => {
    expect(initialMode()).toBe("full");
  });

  it("reads the URL", () => {
    window.history.replaceState(null, "", "/?app=hello");
    expect(initialMode()).toBe("fast");
    window.history.replaceState(null, "", "/?boot=skip");
    expect(initialMode()).toBe("skip");
  });

  it("reads the session flag", () => {
    sessionStorage.setItem(BOOTED_KEY, "1");
    expect(initialMode()).toBe("fast");
  });

  it("ignores any other value in the flag", () => {
    sessionStorage.setItem(BOOTED_KEY, "0");
    expect(initialMode()).toBe("full");
  });

  it("reads the reduced-motion setting", () => {
    os.settings.update({ reducedMotion: "on" });
    expect(initialMode()).toBe("fast");
  });

  it("reads the saved boot mode", () => {
    os.settings.update({ bootMode: "fast" });
    expect(initialMode()).toBe("fast");
  });

  it("reads the system reduced-motion query", () => {
    stubQueries([REDUCED_QUERY]);
    expect(initialMode()).toBe("fast");
  });

  it("reads the fullscreen query", () => {
    stubQueries([FULLSCREEN_QUERY]);
    expect(initialMode()).toBe("fast");
  });

  it("'off' ignores the system query", () => {
    stubQueries([REDUCED_QUERY]);
    os.settings.update({ reducedMotion: "off" });
    expect(initialMode()).toBe("full");
  });
});

describe("failures fall back", () => {
  it("storage and matchMedia errors give a full boot", () => {
    vi.stubGlobal("matchMedia", undefined);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(initialMode()).toBe("full");
    expect(() => markBooted()).not.toThrow();
  });

  it("a matchMedia that throws gives a full boot", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("no media");
    });
    expect(initialMode()).toBe("full");
  });
});

describe("markBooted", () => {
  it("writes the flag", () => {
    expect(sessionStorage.getItem(BOOTED_KEY)).toBeNull();
    markBooted();
    expect(sessionStorage.getItem("beselfos:booted")).toBe("1");
  });

  it("is not the welcome flag", () => {
    expect(BOOTED_KEY).toBe("beselfos:booted");
    expect(BOOTED_KEY).not.toBe("beselfos:welcomed");
  });

  it("uses session storage, not local storage", () => {
    markBooted();
    expect(localStorage.getItem(BOOTED_KEY)).toBeNull();
  });
});

describe("the fullscreen query", () => {
  it("is Screen's", () => {
    // jsdom makes import.meta.url an http URL, so go by the directory.
    const path = resolve(import.meta.dirname, "../screen/Screen.tsx");
    expect(readFileSync(path, "utf8")).toContain(FULLSCREEN_QUERY);
  });
});
