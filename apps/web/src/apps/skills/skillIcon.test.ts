// @vitest-environment node
import { describe, expect, it } from "vitest";
import { staticContent } from "@/content/static";
import {
  EMBLEM_DISC,
  EMBLEM_TEXT,
  MONOGRAMS,
  emblemFontSize,
  monogramFor,
  ringWidth,
} from "./skillIcon";

// The emblem rules are pure numbers and strings, so this runs in node.

const SKILLS = staticContent.skills();

describe("MONOGRAMS", () => {
  it("has one of 1 to 4 characters for every skill, and nothing else", () => {
    expect(SKILLS).toHaveLength(49);
    for (const s of SKILLS) {
      expect(Object.hasOwn(MONOGRAMS, s.id), s.id).toBe(true);
      const n = [...MONOGRAMS[s.id]].length;
      expect(n, s.id).toBeGreaterThanOrEqual(1);
      expect(n, s.id).toBeLessThanOrEqual(4);
    }
    // A key for an id the content does not have is as wrong as a missing one.
    expect(Object.keys(MONOGRAMS).sort()).toEqual(
      SKILLS.map((s) => s.id).sort(),
    );
  });

  it("holds the monograms the issue names", () => {
    expect(MONOGRAMS.python).toBe("Py");
    expect(MONOGRAMS.cpp).toBe("C++");
    expect(MONOGRAMS.csharp).toBe("C#");
    expect(MONOGRAMS.javascript).toBe("JS");
    expect(MONOGRAMS.bash).toBe(">_");
    expect(MONOGRAMS.numpy).toBe("np");
    expect(MONOGRAMS.pandas).toBe("pd");
    expect(MONOGRAMS.excel).toBe("XL");
    expect(MONOGRAMS.nextjs).toBe("Next");
    expect(MONOGRAMS["gemini-api"]).toBe("Gem");
  });

  it("is frozen", () => {
    expect(Object.isFrozen(MONOGRAMS)).toBe(true);
  });
});

describe("monogramFor", () => {
  it("reads the table", () => {
    expect(monogramFor({ id: "python", name: "Python" })).toBe("Py");
    expect(monogramFor({ id: "mips-asm", name: "MIPS Assembly" })).toBe("MIPS");
  });

  it("falls back to the first two characters of the name", () => {
    expect(monogramFor({ id: "zig", name: "Zig" })).toBe("Zi");
    // A plain MONOGRAMS[id] lookup would return Object's constructor.
    expect(monogramFor({ id: "constructor", name: "Ctor" })).toBe("Ct");
    expect(monogramFor({ id: "toString", name: "Str" })).toBe("St");
  });
});

describe("emblemFontSize", () => {
  it("steps down with the length of the monogram", () => {
    expect(emblemFontSize("Py", 56)).toBe(20);
    expect(emblemFontSize("C++", 56)).toBe(16);
    expect(emblemFontSize("Next", 56)).toBe(13);
    expect(emblemFontSize("Py", 72)).toBe(26);
  });

  it("gives one character the size of two, and counts characters", () => {
    expect(emblemFontSize("R", 56)).toBe(20);
    expect(emblemFontSize(">_", 56)).toBe(20);
    // Two characters, though four UTF-16 units: the step of "Py", not "Next".
    expect(emblemFontSize("😀😀", 56)).toBe(20);
  });
});

describe("ringWidth", () => {
  it("is 7 percent of the size and never under 2", () => {
    expect(ringWidth(56)).toBe(4);
    expect(ringWidth(48)).toBe(3);
    expect(ringWidth(72)).toBe(5);
    expect(ringWidth(20)).toBe(2);
  });
});

// WCAG 2.x, written out here. Skills does not import projects/wcag.ts, because
// each app folder is self-contained (plan 3.4).
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

describe("the emblem colours", () => {
  it("are legible: at least 7:1", () => {
    expect(contrast(EMBLEM_TEXT, EMBLEM_DISC)).toBeGreaterThanOrEqual(7);
    // About 17.4, so a swap for a mid grey would not slip under the bar.
    expect(contrast(EMBLEM_TEXT, EMBLEM_DISC)).toBeGreaterThan(17);
  });

  it("are the tokens the issue names", () => {
    expect(EMBLEM_DISC).toBe("#F7F7F7");
    expect(EMBLEM_TEXT).toBe("#2C001E");
  });
});
