// @vitest-environment node
import type { Entry } from "@beself/content";
import { describe, expect, it } from "vitest";
import { staticContent } from "@/content/static";
import {
  countLabel,
  DEFAULT_FILTER,
  entriesFor,
  FILTERS,
  isFilterId,
  viewFor,
  type FilterId,
  type FilterSource,
} from "./filters";

const ids = (filter: FilterId, content: FilterSource = staticContent) =>
  entriesFor(filter, content).map((e) => e.id);

describe("the chips", () => {
  it("are the six of plan 5.2, Featured first", () => {
    expect(FILTERS.map((f) => f.label)).toEqual([
      "Featured",
      "All",
      "Projects",
      "Hackathons",
      "Experience",
      "Volunteer",
    ]);
    expect(FILTERS.map((f) => f.id)).toEqual([
      "featured",
      "all",
      "project",
      "hackathon",
      "experience",
      "volunteer",
    ]);
    expect(DEFAULT_FILTER).toBe("featured");
  });
});

describe("entriesFor", () => {
  it("lists the featured entries in order", () => {
    const list = ids("featured");
    expect(list).toHaveLength(13);
    expect(list[0]).toBe("bash-shell");
    expect(list[list.length - 1]).toBe("thornhill-cs-club");
  });

  it("sorts All by order", () => {
    // entries() lists the experiences last, so an unsorted result has
    // fnaf-project at index 12.
    const list = ids("all");
    expect(list).toHaveLength(23);
    expect(list[12]).toBe("thornhill-cs-club");
    expect(list[13]).toBe("kortright-volunteer");
    expect(list[22]).toBe("stock-change-predictor");
  });

  it("puts the competitions under Projects, in order", () => {
    const list = ids("project");
    expect(list).toHaveLength(17);
    // Between 3d-engine and portfolio-site, not appended after the projects.
    expect(list[8]).toBe("competitive-programming");
    expect(list[7]).toBe("3d-engine");
    expect(list[9]).toBe("portfolio-site");
    expect(list).not.toContain("emberhacks");
    expect(list).not.toContain("thornhill-cs-club");
  });

  it("lists one kind for the other three chips", () => {
    expect(ids("hackathon")).toEqual(["emberhacks", "utmist-ai2"]);
    expect(ids("experience")).toEqual(["thornhill-cs-club"]);
    expect(ids("volunteer")).toEqual([
      "kortright-volunteer",
      "thornhill-concerts",
      "music-council",
    ]);
  });

  it("covers every entry in All and no entry twice across the kind chips", () => {
    const kinds = [
      ...ids("project"),
      ...ids("hackathon"),
      ...ids("experience"),
      ...ids("volunteer"),
    ];
    expect(new Set(kinds).size).toBe(kinds.length);
    expect([...kinds].sort()).toEqual([...ids("all")].sort());
  });

  describe("does not change what the provider returns", () => {
    const entry = (id: string, order: number, kind: Entry["kind"]) =>
      ({ id, order, kind }) as Entry;
    const c = entry("c", 30, "project");
    const a = entry("a", 10, "competition");
    const b = entry("b", 20, "project");
    const frozen = <T>(list: T[]): readonly T[] => Object.freeze(list);

    const fake: FilterSource = {
      entries: () => frozen([c, a, b]),
      entry: (id) => [c, a, b].find((e) => e.id === id),
      featuredEntries: () => frozen([a, b]),
      entriesByKind: () =>
        Object.freeze({
          project: frozen([c, b]),
          hackathon: frozen<Entry>([]),
          experience: frozen<Entry>([]),
          volunteer: frozen<Entry>([]),
          competition: frozen([a]),
        }),
    };

    it("copies before it sorts", () => {
      // Sorting a frozen array in place throws.
      expect(ids("all", fake)).toEqual(["a", "b", "c"]);
      expect(ids("project", fake)).toEqual(["a", "b", "c"]);
    });

    it("returns the other lists as they are", () => {
      expect(ids("featured", fake)).toEqual(["a", "b"]);
      expect(ids("hackathon", fake)).toEqual([]);
    });
  });

  it("leaves the shared lists of staticContent in their order", () => {
    const before = staticContent.entriesByKind().project.map((e) => e.id);
    const all = staticContent.entries().map((e) => e.id);
    ids("all");
    ids("project");
    expect(staticContent.entriesByKind().project.map((e) => e.id)).toEqual(
      before,
    );
    expect(staticContent.entries().map((e) => e.id)).toEqual(all);
  });
});

describe("countLabel", () => {
  it("says item or items", () => {
    expect(countLabel(0)).toBe("0 items");
    expect(countLabel(1)).toBe("1 item");
    expect(countLabel(13)).toBe("13 items");
  });
});

describe("isFilterId", () => {
  it("accepts the six ids", () => {
    for (const f of FILTERS) expect(isFilterId(f.id)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const v of ["Featured", "", undefined, null, "competition", 1]) {
      expect(isFilterId(v), String(v)).toBe(false);
    }
  });
});

describe("viewFor", () => {
  const rows: [
    string,
    { item?: unknown; filter?: unknown },
    { filter: FilterId; selectedId: string | null },
  ][] = [
    ["no args", {}, { filter: "featured", selectedId: null }],
    [
      "a featured item",
      { item: "tetris-asm" },
      { filter: "featured", selectedId: "tetris-asm" },
    ],
    [
      "an item that is not featured switches to All",
      { item: "pong" },
      { filter: "all", selectedId: "pong" },
    ],
    [
      "an item in the requested filter keeps it",
      { item: "emberhacks", filter: "hackathon" },
      { filter: "hackathon", selectedId: "emberhacks" },
    ],
    [
      "an item outside the requested filter switches to All",
      { item: "emberhacks", filter: "volunteer" },
      { filter: "all", selectedId: "emberhacks" },
    ],
    [
      "an unknown item is ignored",
      { item: "nope" },
      { filter: "featured", selectedId: null },
    ],
    [
      "an unknown filter falls back to Featured",
      { filter: "bogus" },
      { filter: "featured", selectedId: null },
    ],
    [
      "a filter alone",
      { filter: "volunteer" },
      { filter: "volunteer", selectedId: null },
    ],
    [
      "an item that is not a string is ignored",
      { item: 42 },
      { filter: "featured", selectedId: null },
    ],
  ];

  it.each(rows)("%s", (_, args, expected) => {
    expect(viewFor(args, staticContent)).toEqual(expected);
  });

  it("ignores an unknown item but keeps a valid filter", () => {
    expect(
      viewFor({ item: "nope", filter: "hackathon" }, staticContent),
    ).toEqual({
      filter: "hackathon",
      selectedId: null,
    });
  });

  it("does not touch frozen args", () => {
    const args = Object.freeze({ item: "pong", filter: "featured" });
    expect(viewFor(args, staticContent).selectedId).toBe("pong");
  });
});
