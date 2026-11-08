// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The engine is pure TypeScript (plan 4.6, D7): it may use only its own
// siblings, no DOM, no clock and no unseeded randomness, so it runs in a node
// test, can be replaced by matter.js, and draws nothing at import (plan 9).

const dir = fileURLToPath(new URL(".", import.meta.url));
const files = readdirSync(dir).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
);

const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const source = (file: string): string =>
  readFileSync(join(dir, file), "utf8").replace(COMMENTS, "");

describe("the physics folder", () => {
  it("holds the engine files", () => {
    // A glob that scans nothing would pass every check below.
    expect(files).toEqual(
      expect.arrayContaining([
        "body.ts",
        "collide.ts",
        "constants.ts",
        "rng.ts",
        "spawn.ts",
        "world.ts",
      ]),
    );
  });

  it("imports only its own siblings", () => {
    for (const file of files) {
      const text = source(file);
      const specifiers = [
        ...text.matchAll(/\bfrom\s*["']([^"']+)["']/g),
        ...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g),
        ...text.matchAll(/\bimport\s*["']([^"']+)["']/g),
      ].map((m) => m[1]);
      for (const specifier of specifiers) {
        expect(
          specifier.startsWith("./"),
          `${file} imports "${specifier}"`,
        ).toBe(true);
      }
    }
  });

  it("touches no browser API, clock or unseeded randomness", () => {
    const forbidden =
      /\b(window|document|navigator|globalThis|requestAnimationFrame|cancelAnimationFrame|performance|setTimeout|setInterval|localStorage|sessionStorage)\b|\bDate\b|Math\.random/;
    for (const file of files) {
      expect(source(file), file).not.toMatch(forbidden);
    }
  });
});
