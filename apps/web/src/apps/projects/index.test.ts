// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import projects, { type ProjectsArgs } from "./index";

const deepLink = projects.deepLink!;
const parse = (query: string) => deepLink.parse(new URLSearchParams(query));

describe("the definition", () => {
  it("keeps the values of the placeholder", () => {
    expect(projects).toMatchObject({
      id: "projects",
      name: "Projects",
      icon: "/icons/apps/projects.svg",
      window: { width: 1040, height: 640, resizable: false },
      capabilities: { minimize: true, maximize: false, close: true },
      singleton: true,
      dock: { pinned: true, order: 1 },
      showInAppGrid: true,
      defaultArgs: {},
    });
    // Cascade placement, and the title stays "Projects".
    expect(projects.window.initialPosition).toBeUndefined();
    expect(projects.title).toBeUndefined();
  });
});

describe("the deep link: parse", () => {
  const rows: [string, string, ProjectsArgs][] = [
    ["nothing", "", {}],
    ["an item", "item=tetris-asm", { item: "tetris-asm" }],
    [
      "an item and a filter",
      "item=tetris-asm&filter=hackathon",
      { item: "tetris-asm", filter: "hackathon" },
    ],
    ["a filter alone", "filter=volunteer", { filter: "volunteer" }],
    ["an unknown filter", "filter=bogus", {}],
    ["an item with a capital and a space", "item=Tetris%20ASM", {}],
    ["an empty item", "item=", {}],
    ["a doubled hyphen", "item=a--b", {}],
    ["a leading hyphen", "item=-a", {}],
    [
      "an item of 64 characters",
      `item=${"a".repeat(64)}`,
      { item: "a".repeat(64) },
    ],
    ["an item of 65 characters", `item=${"a".repeat(65)}`, {}],
    [
      "a good item with a bad filter",
      "item=pong&filter=Featured",
      { item: "pong" },
    ],
    [
      "a bad item with a good filter",
      "item=Pong&filter=all",
      { filter: "all" },
    ],
  ];

  it.each(rows)("%s", (_, query, expected) => {
    const args = parse(query);
    expect(args).not.toBeNull();
    expect(args).toEqual(expected);
    // No key with an undefined value.
    expect(Object.keys(args!)).toEqual(Object.keys(expected));
  });

  it("round-trips through format", () => {
    for (const [, query] of rows) {
      const args = parse(query)!;
      expect(
        parse(new URLSearchParams(deepLink.format(args)).toString()),
      ).toEqual(args);
    }
  });
});

describe("the deep link: format", () => {
  it("writes only the args that are set", () => {
    expect(deepLink.format({})).toEqual({});
    expect(deepLink.format({ item: "pong" })).toEqual({ item: "pong" });
    expect(deepLink.format({ item: "pong", filter: "all" })).toEqual({
      item: "pong",
      filter: "all",
    });
    expect(deepLink.format({ filter: "hackathon" })).toEqual({
      filter: "hackathon",
    });
  });

  it("does not throw on odd input", () => {
    expect(() =>
      deepLink.format({ item: undefined, filter: undefined }),
    ).not.toThrow();
    expect(deepLink.format({ item: "" })).toEqual({});
    expect(() => deepLink.format(Object.freeze({ item: "x" }))).not.toThrow();
  });
});

describe("the eager chunk", () => {
  // registry.ts imports index.ts into the page's first chunk, so it must not
  // pull in the component or the content package.
  const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  const source = (file: string): string =>
    readFileSync(
      fileURLToPath(new URL(`./${file}`, import.meta.url)),
      "utf8",
    ).replace(COMMENTS, "");

  const importLines = (text: string): string[] =>
    [...text.matchAll(/^\s*import\b.*$/gm)].map((m) => m[0].trim());

  it("stays small: index.ts imports react, the contract and the filters", () => {
    const text = source("index.ts");
    const lines = importLines(text);
    // No side-effect import and no import type slips by the count below.
    expect(lines).toHaveLength(3);
    const values = [
      ...text.matchAll(
        /^\s*import\s+(?!type\b)[^;]*?\bfrom\s*["']([^"']+)["']/gm,
      ),
    ].map((m) => m[1]);
    expect(values.sort()).toEqual(["./filters", "@/os/apps/types", "react"]);
    const dynamic = [
      ...text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    expect(dynamic).toEqual(["./ProjectsApp"]);
    expect(text).not.toMatch(
      /from\s*["'](\.\/Carousel|\.\/ProjectsApp|@beself\/content)["']/,
    );
  });

  it("stays small: filters.ts has only type imports", () => {
    const lines = importLines(source("filters.ts"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/^import\s+type\b/);
  });
});
