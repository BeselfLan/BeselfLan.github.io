// @vitest-environment node
import { describe, expect, it } from "vitest";
import { staticContent } from "@/content/static";
import {
  fnv1a,
  hasDrawnIcon,
  TILE_COLOURS,
  tileColour,
  tileInitials,
} from "./entryIcon";
import { contrastRatio } from "./wcag";

describe("fnv1a", () => {
  it("matches the published 32-bit test vectors", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
  });

  it("hashes the UTF-8 bytes and gives an unsigned number", () => {
    // "é" is two bytes in UTF-8 (0xC3 0xA9): a char-code hash would differ.
    let expected = 0x811c9dc5;
    for (const byte of [0xc3, 0xa9]) {
      expected = Math.imul(expected ^ byte, 0x01000193);
    }
    expect(fnv1a("é")).toBe(expected >>> 0);
    for (const text of ["", "a", "foobar", "pong", "é"]) {
      expect(fnv1a(text)).toBeGreaterThanOrEqual(0);
      expect(fnv1a(text)).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("the tile palette", () => {
  it("is fixed, in this order", () => {
    expect([...TILE_COLOURS]).toEqual([
      "#77216F",
      "#5E2750",
      "#B23A12",
      "#2C6E49",
      "#1F5F99",
      "#7A4E0E",
      "#4B5563",
      "#8E2D57",
    ]);
  });

  it("gives white text at least 4.5:1, and the brand orange would not", () => {
    for (const colour of TILE_COLOURS) {
      expect(contrastRatio(colour, "#FFFFFF"), colour).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    // The check can fail: the accent is about 3.65:1 against white.
    expect(contrastRatio("#E95420", "#FFFFFF")).toBeLessThan(4.5);
  });
});

const entries = staticContent.entries();
const plain = entries.filter((e) => !e.featured);

describe("tileColour", () => {
  it("picks from the palette by the hash of the id", () => {
    for (const e of entries) {
      expect(tileColour(e.id)).toBe(TILE_COLOURS[fnv1a(e.id) % 8]);
    }
    expect(tileColour("pong")).toBe("#8E2D57");
    expect(tileColour("edu-video-generator")).toBe("#5E2750");
    expect(tileColour("fnaf-project")).toBe("#B23A12");
  });

  it("spreads the ten entries without a drawn icon over 5 colours", () => {
    expect(plain).toHaveLength(10);
    expect(new Set(plain.map((e) => tileColour(e.id))).size).toBe(5);
  });
});

describe("tileInitials", () => {
  it.each([
    ["Flappy Bird", "FB"],
    ["Pong", "P"],
    ["Kortright Centre for Conservation", "KC"],
    ["3D Software Rasterizer", "3S"],
    ["UTMIST AI^2 Hackathon", "UA"],
    ["  ", "?"],
    ["", "?"],
    ["^^ --", "?"],
    ["a b c", "AB"],
    ["émile zola", "ÉZ"],
  ])("%j gives %j", (title, initials) => {
    expect(tileInitials(title)).toBe(initials);
  });

  it("never gives a blank for a real entry", () => {
    for (const e of entries)
      expect(tileInitials(e.title)).toMatch(/^[\p{L}\p{N}]{1,2}$/u);
  });
});

describe("hasDrawnIcon", () => {
  it("follows featured, for every entry", () => {
    expect(entries.length).toBe(23);
    for (const e of entries) expect(hasDrawnIcon(e), e.id).toBe(e.featured);
    expect(entries.filter(hasDrawnIcon)).toHaveLength(13);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white, either way round", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  it("is 4.48 for #777777 on white, lighter over darker", () => {
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#FFFFFF", "#777777")).toBeCloseTo(4.48, 2);
  });

  it("is 1 for a colour against itself and throws on anything but #RRGGBB", () => {
    expect(contrastRatio("#2C001E", "#2c001e")).toBeCloseTo(1, 10);
    expect(() => contrastRatio("red", "#FFFFFF")).toThrow();
    expect(() => contrastRatio("#FFF", "#FFFFFF")).toThrow();
    expect(() => contrastRatio("#FFFFFF", "#GGGGGG")).toThrow();
  });
});
