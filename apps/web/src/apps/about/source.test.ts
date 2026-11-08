// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Every fact in the About app comes from the content package through
// `api.content`. The app reads no private file, imports no content module for
// a value, and has no phone link.

const dir = fileURLToPath(new URL(".", import.meta.url));
const files = readdirSync(dir)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => [f, readFileSync(`${dir}${f}`, "utf8")] as const);

// A value import: not `import type`, from either content module. `[^;]`
// crosses a line break, so a multi-line import list matches.
const VALUE_IMPORT =
  /\b(?:import|export)\s+(?!type\b)[^;]*?from\s+["'](?:@beself\/content|@\/content\/static)["']/;
const BARE_IMPORT =
  /\bimport\s*\(?\s*["'](?:@beself\/content|@\/content\/static)["']/;

describe("the About folder reads no private file and no content module directly", () => {
  it("has the files this test is meant to guard", () => {
    const names = files.map(([name]) => name);
    expect(names).toEqual(
      expect.arrayContaining([
        "AboutApp.tsx",
        "AboutSections.tsx",
        "ProfileCard.tsx",
        "format.ts",
        "index.ts",
      ]),
    );
  });

  it.each(files)("%s names no private file", (_, text) => {
    expect(text).not.toContain("info.txt");
  });

  it.each(files)("%s has no value import of a content module", (_, text) => {
    expect(VALUE_IMPORT.test(text)).toBe(false);
    expect(BARE_IMPORT.test(text)).toBe(false);
  });

  it.each(files)("%s makes no phone link", (_, text) => {
    expect(text).not.toMatch(/tel:/i);
  });

  it("the import check sees a value import and lets a type import pass", () => {
    const value = 'import { staticContent } from "@/content/static";';
    const multi =
      'import {\n  content,\n  bootGroups,\n} from "@beself/content";';
    const type = 'import type { Profile } from "@beself/content";';
    expect(VALUE_IMPORT.test(value)).toBe(true);
    expect(VALUE_IMPORT.test(multi)).toBe(true);
    expect(VALUE_IMPORT.test(type)).toBe(false);
    expect(BARE_IMPORT.test('import "@beself/content";')).toBe(true);
  });
});
