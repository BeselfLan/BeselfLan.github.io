import { lazy, type ComponentType } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  defineApp,
  type AnyAppDefinition,
  type AppApi,
  type AppDefinition,
  type AppProps,
} from "@/os/apps/types";
import type { WindowApp } from "@/os/store/windows";

// Most of this file is checked by `npm run typecheck`: a missing or renamed
// 4.1 field is a compile error here. The runtime asserts are a courtesy.

type ProjectArgs = { projectId: string };
type NoteArgs = { note: number };

const component = lazy<ComponentType<AppProps<ProjectArgs>>>(() =>
  Promise.resolve({ default: () => null }),
);

// Every 4.1 field, set.
const def: AppDefinition<ProjectArgs> = {
  id: "projects",
  name: "Projects",
  icon: "/icons/apps/projects.svg",
  window: {
    width: 800,
    height: 520,
    resizable: false,
    initialPosition: { x: 120, y: 80 },
    chrome: "default",
  },
  capabilities: {
    minimize: true,
    maximize: false,
    close: true,
    alwaysOnTop: false,
  },
  singleton: false,
  instanceKey: (args) => args.projectId,
  dock: { pinned: true, order: 1 },
  showInAppGrid: true,
  component,
  defaultArgs: { projectId: "first" },
  deepLink: {
    parse: (params) => {
      const projectId = params.get("project");
      return projectId ? { projectId } : null;
    },
    format: (args) => ({ project: args.projectId }),
  },
  title: (args) => `Projects -- ${args.projectId}`,
  menu: [{ id: "new", label: "New", onSelect() {} }],
  shortcuts: [{ combo: "Ctrl+K", handler() {} }],
  onBeforeClose: () => true,
};

const note: AppDefinition<NoteArgs> = {
  id: "notes",
  name: "Notes",
  icon: "/icons/apps/notes.svg",
  window: { width: 400, height: 300, resizable: false },
  capabilities: { minimize: true, maximize: false, close: true },
  singleton: true,
  dock: null,
  showInAppGrid: false,
  component: lazy<ComponentType<AppProps<NoteArgs>>>(() =>
    Promise.resolve({ default: () => null }),
  ),
};

describe("the app contract", () => {
  it("a definition with every 4.1 field type-checks", () => {
    expect(def.title?.({ projectId: "x" })).toBe("Projects -- x");
    expect(def.window.resizable).toBe(false);

    expectTypeOf<AppProps<{ n: number }>>().toEqualTypeOf<{
      windowId: string;
      args: { n: number };
      api: AppApi;
    }>();
    expectTypeOf<keyof AppApi>().toEqualTypeOf<
      | "close"
      | "minimize"
      | "focus"
      | "setTitle"
      | "openApp"
      | "notify"
      | "isVisible"
      | "subscribeVisible"
      | "bounds"
      | "registerShortcut"
      | "content"
      | "media"
    >();
    // The literal `false` of v1: a resizable window is a compile error.
    expectTypeOf<AppDefinition["window"]["resizable"]>().toEqualTypeOf<false>();
  });

  it("a typed definition fits the window slice", () => {
    const asApp: WindowApp = def;
    expect(asApp.id).toBe("projects");

    // Different Args in one list: only defineApp makes this compile.
    const list: AnyAppDefinition[] = [defineApp(def), defineApp(note)];
    expect(list.map((d) => d.id)).toEqual(["projects", "notes"]);
    // Erasing changes the type, not the object.
    expect(list[0]).toBe(def);
  });
});
