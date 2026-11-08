// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import skills, { type SkillsArgs } from "./index";

const deepLink = skills.deepLink!;
const parse = (query: string) => deepLink.parse(new URLSearchParams(query));

describe("the definition", () => {
  it("keeps the pinned values", () => {
    expect(skills).toMatchObject({
      id: "skills",
      name: "Skills",
      icon: "/icons/apps/skills.svg",
      window: { width: 1000, height: 620, resizable: false },
      capabilities: { minimize: true, maximize: false, close: true },
      singleton: true,
      dock: { pinned: true, order: 2 },
      showInAppGrid: true,
      defaultArgs: {},
    });
    // Cascade placement, and the title stays "Skills".
    expect(skills.window.initialPosition).toBeUndefined();
    expect(skills.title).toBeUndefined();
    expect(skills.defaultArgs).toEqual({});
  });
});

describe("the deep link: parse", () => {
  const rows: [string, string, SkillsArgs][] = [
    ["nothing", "", {}],
    ["an item", "item=python", { item: "python" }],
    [
      "the whole query of page.test.tsx",
      "app=skills&item=python",
      { item: "python" },
    ],
    ["an item with a capital", "item=Python", {}],
    ["an empty item", "item=", {}],
    ["a doubled hyphen", "item=a--b", {}],
    ["a leading hyphen", "item=-a", {}],
    ["an item with a space", "item=c%20sharp", {}],
    [
      "an item of 64 characters",
      `item=${"a".repeat(64)}`,
      { item: "a".repeat(64) },
    ],
    ["an item of 65 characters", `item=${"a".repeat(65)}`, {}],
    ["a tab", "tab=tool", { tab: "tool" }],
    ["every tab", "tab=all", { tab: "all" }],
    ["the practice tab, which does not exist", "tab=practice", {}],
    ["a tab with a capital", "tab=Tools", {}],
    ["an unknown tab", "tab=bogus", {}],
    ["an empty tab", "tab=", {}],
    ["an item and a tab", "item=git&tab=tool", { item: "git", tab: "tool" }],
    ["a good item with a bad tab", "item=git&tab=Tools", { item: "git" }],
    ["a bad item with a good tab", "item=Git&tab=tool", { tab: "tool" }],
    ["other parameters", "boot=full&app=skills&x=1", {}],
  ];

  it.each(rows)("%s", (_, query, expected) => {
    const args = parse(query);
    expect(args).not.toBeNull();
    expect(args).toEqual(expected);
    // No key with an undefined value, and no key the link did not carry.
    expect(Object.keys(args!)).toEqual(Object.keys(expected));
  });

  it("adds no tab to a link that has none", () => {
    expect(Object.keys(parse("app=skills&item=python")!)).toEqual(["item"]);
    expect(parse("item=python")).not.toHaveProperty("tab");
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
    expect(deepLink.format({ item: "x" })).toEqual({ item: "x" });
    expect(deepLink.format({ item: "git", tab: "tool" })).toEqual({
      item: "git",
      tab: "tool",
    });
    expect(deepLink.format({ tab: "library" })).toEqual({ tab: "library" });
    expect(deepLink.format({ item: "" })).toEqual({});
  });

  it("does not throw on odd input", () => {
    expect(() =>
      deepLink.format({ item: undefined, tab: undefined }),
    ).not.toThrow();
    expect(deepLink.format({ item: undefined, tab: undefined })).toEqual({});
    expect(() => deepLink.format(Object.freeze({ item: "x" }))).not.toThrow();
    expect(() =>
      deepLink.format(Object.freeze({ item: "x", tab: "tool" as const })),
    ).not.toThrow();
  });
});

describe("the eager chunk", () => {
  // registry.ts imports index.ts into the page's first chunk, so it must not
  // pull in the component, the pointer maths or the content package.
  const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  const source = (file: string): string =>
    readFileSync(
      fileURLToPath(new URL(`./${file}`, import.meta.url)),
      "utf8",
    ).replace(COMMENTS, "");

  const importLines = (text: string): string[] =>
    [...text.matchAll(/^\s*import\b.*$/gm)].map((m) => m[0].trim());

  it("stays small: index.ts imports react, the contract and the tabs", () => {
    const text = source("index.ts");
    const lines = importLines(text);
    // No side-effect import and no import type slips by the count below.
    expect(lines).toHaveLength(3);
    const values = [
      ...text.matchAll(
        /^\s*import\s+(?!type\b)[^;]*?\bfrom\s*["']([^"']+)["']/gm,
      ),
    ].map((m) => m[1]);
    expect(values.sort()).toEqual(["./tabs", "@/os/apps/types", "react"]);
    const dynamic = [
      ...text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    expect(dynamic).toEqual(["./SkillsApp"]);
    expect(text).not.toMatch(
      /from\s*["'](\.\/interaction|\.\/layout|\.\/SkillsApp|@beself\/content)["']/,
    );
  });

  it("stays small: tabs.ts has only type imports", () => {
    const lines = importLines(source("tabs.ts"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/^import\s+type\b/);
  });
});
