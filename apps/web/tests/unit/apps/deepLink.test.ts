import { lazy, type ComponentType } from "react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyDeepLink,
  parseDeepLink,
  startUrlSync,
  urlFor,
} from "@/os/apps/deepLink";
import { apps, appLookup } from "@/os/apps/registry";
import {
  defineApp,
  type AnyAppDefinition,
  type AppDefinition,
  type AppProps,
} from "@/os/apps/types";
import { os, useOS } from "@/os/store";

// The real registry is the lookup. The URL lives in jsdom's history, so each
// test starts at "/" and spies on replaceState and pushState.

const items = () => useOS.getState().windows.items;
let stop: (() => void) | undefined;

beforeEach(() => {
  localStorage.clear();
  useOS.setState(useOS.getInitialState(), true);
  os.windows.setAppLookup(appLookup);
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.restoreAllMocks();
});

function fake<A>(id: string, deepLink: AppDefinition<A>["deepLink"]) {
  return defineApp<A>({
    id,
    name: id,
    icon: "",
    window: { width: 100, height: 100, resizable: false },
    capabilities: { minimize: true, maximize: false, close: true },
    singleton: true,
    dock: null,
    showInAppGrid: false,
    component: lazy<ComponentType<AppProps<A>>>(() =>
      Promise.resolve({ default: () => null }),
    ),
    deepLink,
  });
}
const lookupOf = (...list: AnyAppDefinition[]) => {
  const byId = new Map(list.map((a) => [a.id, a]));
  return (id: string) => byId.get(id);
};

function spyHistory() {
  return {
    replace: vi.spyOn(window.history, "replaceState"),
    push: vi.spyOn(window.history, "pushState"),
  };
}

describe("parseDeepLink", () => {
  it("parses a link to a known app", () => {
    expect(parseDeepLink("?app=projects&item=tetris-asm")).toEqual({
      appId: "projects",
      args: { item: "tetris-asm" },
    });
    // A URLSearchParams works too, and an app with no params opens bare.
    expect(parseDeepLink(new URLSearchParams("app=about"))).toEqual({
      appId: "about",
      args: {},
    });
  });

  it("ignores what it cannot open", () => {
    const open = vi.spyOn(os.windows, "openApp");
    for (const search of [
      "?app=nope",
      "?app=video-player&projectId=x", // no deepLink
      "?item=x", // no app
      "?app=",
      "",
    ]) {
      expect(parseDeepLink(search), search).toBeNull();
      expect(() => applyDeepLink(search), search).not.toThrow();
      expect(applyDeepLink(search), search).toBeNull();
    }
    expect(open).not.toHaveBeenCalled();
    expect(items()).toHaveLength(0);
  });

  it("ignores a link whose parse says no", () => {
    const lookup = lookupOf(
      fake<{ id: string }>("picky", {
        parse: (p) => {
          const id = p.get("id");
          return id ? { id } : null;
        },
        format: (a) => ({ id: a.id }),
      }),
    );
    expect(parseDeepLink("?app=picky", lookup)).toBeNull();
    expect(parseDeepLink("?app=picky&id=7", lookup)).toEqual({
      appId: "picky",
      args: { id: "7" },
    });
  });
});

describe("applyDeepLink", () => {
  it("applies once on load", () => {
    expect(applyDeepLink("?app=skills&item=python")).toBe("skills");
    expect(items()).toHaveLength(1);
    expect(items()[0].id).toBe("skills");
    expect(items()[0].args).toEqual({ item: "python" });
  });

  it("returns null instead of throwing when the open fails", () => {
    vi.spyOn(os.windows, "openApp").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(applyDeepLink("?app=about")).toBeNull();
  });
});

describe("the URL sync", () => {
  it("writes the focused window to the URL with replaceState", () => {
    const { replace, push } = spyHistory();
    stop = startUrlSync();
    expect(replace).not.toHaveBeenCalled();

    act(() => void os.windows.openApp("projects", { item: "a" }));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/?app=projects&item=a");
    expect(window.location.search).toBe("?app=projects&item=a");

    // Same window, new args: the focused id did not change, the URL must.
    act(() => void os.windows.openApp("projects", { item: "b" }));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/?app=projects&item=b");
    expect(replace).toHaveBeenCalledTimes(2);

    // An app with no deepLink focused: the bare path.
    act(() => void os.windows.openApp("video-player", { projectId: "x" }));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/");
    expect(replace).toHaveBeenCalledTimes(3);

    // Focus goes back, then every window closes.
    act(() => os.windows.focusWindow("projects"));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/?app=projects&item=b");
    act(() => void os.windows.closeWindow("projects"));
    act(() => void os.windows.closeWindow("video-player:x"));
    expect(items()).toHaveLength(0);
    expect(replace).toHaveBeenLastCalledWith(null, "", "/");
    expect(window.location.search).toBe("");

    expect(push).not.toHaveBeenCalled();
  });

  it("writes nothing when nothing changed", () => {
    act(() => void os.windows.openApp("projects", { item: "a" }));
    const { replace } = spyHistory();
    stop = startUrlSync();
    // Not at start, even though a window is open.
    expect(replace).not.toHaveBeenCalled();

    act(() => os.windows.moveWindow("projects", { x: 300, y: 200 }));
    act(() => os.windows.focusWindow("projects"));
    act(() => os.windows.setTitle("projects", "Other"));
    expect(replace).not.toHaveBeenCalled();
  });

  it("drops other params", () => {
    window.history.replaceState(null, "", "/?boot=full&app=skills");
    expect(applyDeepLink(window.location.search)).toBe("skills");
    const { replace } = spyHistory();
    stop = startUrlSync();
    expect(replace).not.toHaveBeenCalled();

    act(() => void os.windows.openApp("about"));
    act(() => os.windows.focusWindow("skills"));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/?app=skills");
    for (const [, url] of replace.mock.calls.map((c) => [c[0], c[2]])) {
      expect(String(url)).not.toContain("boot");
    }
    expect(window.location.search).toBe("?app=skills");
  });

  it("stops writing after the unsubscribe", () => {
    const { replace } = spyHistory();
    const off = startUrlSync();
    off();
    act(() => void os.windows.openApp("projects", { item: "a" }));
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("urlFor", () => {
  it("is the bare path with no window, and the path is kept", () => {
    expect(urlFor(useOS.getState(), "/")).toBe("/");
    expect(urlFor(useOS.getState(), "/deep/")).toBe("/deep/");
    act(() => void os.windows.openApp("about"));
    expect(urlFor(useOS.getState(), "/deep/")).toBe("/deep/?app=about");
  });

  it("an app cannot take over the app param, and a throwing format is safe", () => {
    const lookup = lookupOf(
      fake<{ n: number }>("bad", {
        parse: () => ({ n: 1 }),
        format: () => {
          throw new Error("no");
        },
      }),
      fake<{ n: number }>("sneaky", {
        parse: () => ({ n: 1 }),
        format: () => ({ app: "other", n: "1" }),
      }),
    );
    os.windows.setAppLookup(lookup);

    act(() => void os.windows.openApp("bad"));
    expect(urlFor(useOS.getState(), "/", lookup)).toBe("/");
    act(() => void os.windows.openApp("sneaky"));
    expect(urlFor(useOS.getState(), "/", lookup)).toBe("/?app=sneaky&n=1");
  });
});

describe("the registered deep links", () => {
  it("round trip", () => {
    const withLink = apps.flatMap((a) =>
      a.deepLink ? [{ id: a.id, link: a.deepLink }] : [],
    );
    expect(withLink.map((a) => a.id)).toEqual([
      "projects",
      "skills",
      "about",
      "hello",
    ]);
    // One query that carries every param an app of v1 reads; an app takes the
    // ones it knows, so this needs no row per app.
    const probe = new URLSearchParams(
      "item=x&filter=f&tab=t&name=Ann&projectId=p",
    );
    for (const { id, link } of withLink) {
      const args = link.parse(probe);
      expect(args, id).not.toBeNull();
      expect(link.parse(new URLSearchParams(link.format(args))), id).toEqual(
        args,
      );
    }
  });
});
