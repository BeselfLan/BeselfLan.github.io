import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, lazy, type ComponentType } from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  apps,
  appLookup,
  chromeFor,
  chromeOf,
  dockApps,
  getApp,
  gridApps,
  indexById,
  renderContent,
} from "@/os/apps/registry";
import {
  defineApp,
  type AnyAppDefinition,
  type AppDefinition,
  type AppProps,
  type NoArgs,
} from "@/os/apps/types";
import { os, useOS } from "@/os/store";
import { WindowIdContext } from "@/os/window/useWindowVisible";

const ids = () => apps.map((a) => a.id);

function definitionOf(id: string): AnyAppDefinition {
  const def = getApp(id);
  if (!def) throw new Error(`no app "${id}" in the registry`);
  return def;
}

function fake(
  id: string,
  over: Partial<AppDefinition<NoArgs>> = {},
): AnyAppDefinition {
  return defineApp<NoArgs>({
    id,
    name: id,
    icon: "",
    window: { width: 100, height: 100, resizable: false },
    capabilities: { minimize: true, maximize: false, close: true },
    singleton: true,
    dock: null,
    showInAppGrid: false,
    component: lazy<ComponentType<AppProps<NoArgs>>>(() =>
      Promise.resolve({ default: () => null }),
    ),
    ...over,
  });
}

beforeEach(() => {
  localStorage.clear();
  useOS.setState(useOS.getInitialState(), true);
  os.windows.setAppLookup(appLookup);
});

describe("the registry", () => {
  it("lists the five v1 apps", () => {
    expect(ids()).toEqual([
      "projects",
      "skills",
      "video-player",
      "about",
      "hello",
    ]);
  });

  it("ids are unique and kebab-case", () => {
    for (const id of ids()) {
      expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    }
    expect(new Set(ids()).size).toBe(ids().length);
    expect(indexById(apps).size).toBe(5);

    expect(() =>
      indexById([fake("twin"), fake("other"), fake("twin")]),
    ).toThrow(/twin/);
  });

  it("definitions carry the plan values", () => {
    const rows = [
      {
        id: "projects",
        name: "Projects",
        width: 1040,
        height: 640,
        dock: { pinned: true, order: 1 },
        grid: true,
        singleton: true,
      },
      {
        id: "skills",
        name: "Skills",
        width: 1000,
        height: 620,
        dock: { pinned: true, order: 2 },
        grid: true,
        singleton: true,
      },
      {
        id: "about",
        name: "About",
        width: 760,
        height: 600,
        dock: { pinned: true, order: 3 },
        grid: true,
        singleton: true,
      },
      {
        id: "video-player",
        name: "Video Player",
        width: 880,
        height: 540,
        dock: null,
        grid: false,
        singleton: false,
      },
      {
        id: "hello",
        name: "Hello",
        width: 480,
        height: 360,
        dock: null,
        grid: true,
        singleton: true,
      },
    ];
    expect(rows.map((r) => r.id).sort()).toEqual(ids().sort());

    for (const row of rows) {
      const def = definitionOf(row.id);
      expect(def.name, row.id).toBe(row.name);
      expect(def.window.width, row.id).toBe(row.width);
      expect(def.window.height, row.id).toBe(row.height);
      expect(def.dock, row.id).toEqual(row.dock);
      expect(def.showInAppGrid, row.id).toBe(row.grid);
      expect(def.singleton, row.id).toBe(row.singleton);
      expect(def.icon, row.id).toBe(`/icons/apps/${row.id}.svg`);
      expect(def.window.resizable, row.id).toBe(false);
      expect(def.capabilities, row.id).toEqual({
        minimize: true,
        maximize: false,
        close: true,
      });
    }
  });

  it("the video player is keyed by project", () => {
    expect(
      os.windows.openApp("video-player", { projectId: "tetris-asm" }),
    ).toBe("video-player:tetris-asm");
    expect(
      os.windows.openApp("video-player", { projectId: "tetris-asm" }),
    ).toBe("video-player:tetris-asm");
    expect(useOS.getState().windows.items).toHaveLength(1);
    expect(useOS.getState().windows.items[0].title).toBe("tetris-asm -- Demo");

    // Another project gets its own window.
    os.windows.openApp("video-player", { projectId: "other" });
    expect(useOS.getState().windows.items.map((w) => w.id)).toEqual([
      "video-player:tetris-asm",
      "video-player:other",
    ]);
  });

  it("the video player needs a projectId", () => {
    // No defaultArgs, on purpose: only Play in Projects opens it.
    expect(() => os.windows.openApp("video-player")).toThrow();
    expect(useOS.getState().windows.items).toHaveLength(0);
  });

  it("chrome comes from the definition", () => {
    expect(chromeOf("projects")).toMatchObject({
      minimize: true,
      maximize: false,
      close: true,
    });
    // The layer then uses FALLBACK_CHROME.
    expect(chromeOf("nope")).toBeUndefined();
    // Stable, so a frame does not re-render with the layer.
    expect(chromeOf("projects")).toBe(chromeOf("projects"));

    const frameless = fake("frameless", {
      window: { width: 1, height: 1, resizable: false, chrome: "none" },
      capabilities: { minimize: false, maximize: true, close: false },
    });
    expect(chromeFor(frameless)).toEqual({
      minimize: false,
      maximize: true,
      close: false,
      chrome: "none",
    });
  });

  it("dock and grid lists", () => {
    expect(dockApps.map((a) => a.id)).toEqual(["projects", "skills", "about"]);
    const grid = gridApps.map((a) => a.id);
    expect(grid).toContain("hello");
    expect(grid).not.toContain("video-player");
    expect(grid).toEqual(["projects", "skills", "about", "hello"]);
  });

  it("the lookup returns the same object every call", () => {
    expect(getApp("projects")).toBeDefined();
    expect(getApp("projects")).toBe(getApp("projects"));
    expect(getApp("projects")).toBe(apps[0]);
    expect(getApp("nope")).toBeUndefined();
    expect(appLookup).toBe(getApp);
  });

  it("every app renders through AppHost", async () => {
    for (const app of apps) {
      const args =
        app.id === "video-player" ? { projectId: "tetris-asm" } : undefined;
      let windowId = "";
      act(() => {
        windowId = os.windows.openApp(app.id, args);
      });
      // Only the frame provides the window id; outside the layer a test does.
      const view = render(
        createElement(
          WindowIdContext,
          { value: windowId },
          renderContent(windowId),
        ),
      );
      expect(
        await screen.findByRole("heading", { name: new RegExp(app.name) }),
        app.id,
      ).toBeTruthy();
      view.unmount();
    }
  }, 30_000);

  it("Hello greets the world by default", async () => {
    let windowId = "";
    act(() => {
      windowId = os.windows.openApp("hello");
    });
    render(
      createElement(
        WindowIdContext,
        { value: windowId },
        renderContent(windowId),
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "Hello, world" }),
    ).toBeTruthy();
  });

  it("each deep-link definition round-trips", () => {
    const roundTrip = (id: string, args: Record<string, string>) => {
      const link = definitionOf(id).deepLink;
      if (!link) throw new Error(`${id} has no deepLink`);
      return link.parse(new URLSearchParams(link.format(args)));
    };
    expect(roundTrip("projects", { item: "x" })).toEqual({ item: "x" });
    expect(roundTrip("skills", { item: "x" })).toEqual({ item: "x" });
    expect(roundTrip("hello", { name: "Ann" })).toEqual({ name: "Ann" });

    // Unset args write nothing to the URL, so no `item=undefined`.
    for (const id of ["projects", "skills", "hello"]) {
      expect(definitionOf(id).deepLink?.format({}), id).toEqual({});
    }

    // About has no params: `?app=about` alone opens it.
    const about = definitionOf("about").deepLink;
    expect(about?.parse(new URLSearchParams())).toEqual({});
    expect(about?.format({})).toEqual({});

    // The player is opened only from Projects.
    expect(definitionOf("video-player").deepLink).toBeUndefined();
  });

  it("the markers are in place", () => {
    // `npm run new-app` inserts a line just above each marker.
    const source = readFileSync(
      join(import.meta.dirname, "../../../src/os/apps/registry.ts"),
      "utf8",
    );
    const lines = source.split("\n").map((l) => l.trim());
    const at = (marker: string) =>
      lines.flatMap((l, i) => (l === marker ? [i] : []));

    const imports = at("// new-app: imports");
    expect(imports).toHaveLength(1);
    expect(lines[imports[0] - 1]).toMatch(/^import .*;$/);
    // No import after the marker.
    expect(lines.slice(imports[0]).some((l) => l.startsWith("import "))).toBe(
      false,
    );

    const entries = at("// new-app: entries");
    expect(entries).toHaveLength(1);
    expect(lines[entries[0] - 1]).toBe("hello,");
    expect(lines[entries[0] + 1]).toBe("];");
  });
});
