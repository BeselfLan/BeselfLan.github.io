import { describe, expect, it } from "vitest";
import { gridApps } from "@/os/apps/registry";
import { APP_GRID_ID, filterApps } from "./appGrid";

const ids = (list: readonly { id: string }[]) => list.map((a) => a.id);

describe("filterApps", () => {
  it("matches the start of a word, ignoring case and spaces around", () => {
    expect(ids(filterApps(gridApps, "ski"))).toEqual(["skills"]);
    expect(ids(filterApps(gridApps, "SKI"))).toEqual(["skills"]);
    expect(ids(filterApps(gridApps, "  ski "))).toEqual(["skills"]);
  });

  it("gives every grid app, in registry order, for an empty query", () => {
    const all = ["projects", "skills", "about", "hello"];
    expect(ids(filterApps(gridApps, ""))).toEqual(all);
    // Spaces alone are an empty query too.
    expect(ids(filterApps(gridApps, "   "))).toEqual(all);
    // A copy: the caller may sort it without touching the registry.
    expect(filterApps(gridApps, "")).not.toBe(gridApps);
  });

  it("does not match the middle of a word", () => {
    // "ell" is inside Hello, and a substring match would find it.
    expect(filterApps(gridApps, "ell")).toEqual([]);
    expect(ids(filterApps(gridApps, "p"))).toEqual(["projects"]);
    expect(filterApps(gridApps, "zzz")).toEqual([]);
  });

  it("matches the start of any word of a longer name", () => {
    const list = [{ id: "video-player", name: "Video Player" }];
    expect(filterApps(list, "pla")).toEqual(list);
    expect(filterApps(list, "vid")).toEqual(list);
    expect(filterApps(list, "ayer")).toEqual([]);
  });

  it("needs every query word to start a word of the name", () => {
    const list = [{ id: "video-player", name: "Video Player" }];
    expect(filterApps(list, "vid pla")).toEqual(list);
    expect(filterApps(list, "pla vid")).toEqual(list);
    expect(filterApps(list, "vid x")).toEqual([]);
  });

  it("keeps the order of the list it is given", () => {
    const list = [
      { id: "b", name: "Beta Tool" },
      { id: "a", name: "Alpha Tool" },
    ];
    expect(ids(filterApps(list, "tool"))).toEqual(["b", "a"]);
  });
});

describe("APP_GRID_ID", () => {
  it("is the id Activities and Show Applications point at", () => {
    expect(APP_GRID_ID).toBe("desktop-app-grid");
  });
});
