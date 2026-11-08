import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { staticContent } from "@/content/static";
import { hasDrawnIcon } from "./entryIcon";
import { contrastRatio } from "./wcag";

// The drawn icons under public/icons/entries (D17, plan 5.7). The issue's art
// rules are checked here instead of by eye: one shape for the whole set, no
// text, nothing outside the file, and a motif that stands out of its tile.
// jsdom, not node, because DOMParser reads the XML.

const publicDir = join(import.meta.dirname, "../../../public") + "/";
const iconsDir = `${publicDir}icons/entries/`;
const entries = staticContent.entries();
const svgFiles = readdirSync(iconsDir)
  .filter((f) => f.endsWith(".svg"))
  .sort();
const read = (file: string) => readFileSync(`${iconsDir}${file}`, "utf8");

const HEX = /^#[0-9a-fA-F]{6}$/;

/** `null` when the text is a well-formed SVG document, else the reason. */
function parseProblem(text: string): string | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, "image/svg+xml");
  } catch (e) {
    return `parse threw: ${String(e)}`;
  }
  if (doc.querySelector("parsererror")) return "parsererror in the result";
  return doc.documentElement.localName === "svg" ? null : "root is not svg";
}

/** The #RRGGBB fill or stroke an element names first, in attribute order. */
function firstHex(el: Element): string | null {
  for (const attr of Array.from(el.attributes)) {
    if (
      (attr.name === "fill" || attr.name === "stroke") &&
      HEX.test(attr.value)
    ) {
      return attr.value;
    }
  }
  return null;
}

/**
 * The tile shape of an icon: its first child must be the 96 x 96 rounded
 * rectangle. Returns the problems, [] when it is right.
 */
function tileProblems(text: string): string[] {
  const root = new DOMParser().parseFromString(
    text,
    "image/svg+xml",
  ).documentElement;
  const tile = root.firstElementChild;
  const problems: string[] = [];
  if (!tile || tile.localName !== "rect") return ["first child is not a rect"];
  if (tile.getAttribute("width") !== "96")
    problems.push("tile width is not 96");
  if (tile.getAttribute("height") !== "96")
    problems.push("tile height is not 96");
  for (const axis of ["x", "y"]) {
    const v = tile.getAttribute(axis);
    if (v !== null && Number(v) !== 0) problems.push(`tile ${axis} is ${v}`);
  }
  const rx = Number(tile.getAttribute("rx"));
  if (!(rx >= 16 && rx <= 24)) problems.push(`tile rx is ${rx}`);
  const fill = tile.getAttribute("fill") ?? "";
  if (!HEX.test(fill)) problems.push(`tile fill is "${fill}"`);
  return problems;
}

/** Contrast of the motif's first colour against the tile, or null if none. */
function motifContrast(text: string): number | null {
  const root = new DOMParser().parseFromString(
    text,
    "image/svg+xml",
  ).documentElement;
  const tile = root.firstElementChild?.getAttribute("fill") ?? "";
  const later = Array.from(root.querySelectorAll("*")).slice(1);
  for (const el of later) {
    const colour = firstHex(el);
    if (colour) return contrastRatio(colour, tile);
  }
  return null;
}

const drawn = entries.filter(hasDrawnIcon);
const plain = entries.filter((e) => !hasDrawnIcon(e));

describe("entry icon files", () => {
  it("has a file for every entry that has a drawn icon", () => {
    expect(drawn).toHaveLength(13);
    for (const e of drawn) {
      expect(existsSync(`${publicDir}${e.icon}`), `${e.id}: ${e.icon}`).toBe(
        true,
      );
    }
  });

  it("has no file for an entry without a drawn icon", () => {
    expect(plain).toHaveLength(10);
    for (const e of plain) {
      expect(
        existsSync(`${publicDir}${e.icon}`),
        `${e.id} has ${e.icon}: change hasDrawnIcon in entryIcon.ts`,
      ).toBe(false);
    }
  });

  it("has exactly the files of the drawn entries, so no file is stray", () => {
    expect(svgFiles).toEqual(drawn.map((e) => `${e.id}.svg`).sort());
  });
});

describe("icon files are safe and small", () => {
  it("covers every file in the folder", () => {
    expect(svgFiles.length).toBeGreaterThanOrEqual(13);
  });

  it.each(svgFiles)("%s", (file) => {
    const text = read(file);
    expect(text.startsWith("<svg")).toBe(true);
    // On the root element, not anywhere in the text: the tile rect also has
    // a width and a height.
    const root = new DOMParser().parseFromString(
      text,
      "image/svg+xml",
    ).documentElement;
    expect(root.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    expect(root.getAttribute("viewBox")).toBe("0 0 96 96");
    // Without a width an <img> has no natural size: naturalWidth can read 0.
    expect(root.getAttribute("width")).toBe("96");
    expect(root.getAttribute("height")).toBe("96");
    expect(statSync(`${iconsDir}${file}`).size).toBeLessThanOrEqual(2048);

    for (const banned of [
      "<?xml",
      "<!--",
      "<text",
      "<tspan",
      "<script",
      "<style",
      "<foreignObject",
      "<image",
      "<title",
      "<desc",
      "<metadata",
      "<a ",
      "xmlns:",
      "currentColor",
    ]) {
      expect(text, `${file} holds ${banned}`).not.toContain(banned);
    }
    expect(text).not.toMatch(/\son[a-zA-Z]+\s*=/);
    for (const m of text.matchAll(/href\s*=\s*["']([^"']*)["']/g)) {
      expect(m[1], `${file} links out`).toMatch(/^#/);
    }
    for (const m of text.matchAll(/url\(\s*["']?([^)"']*)/g)) {
      expect(m[1], `${file} loads from outside`).toMatch(/^#/);
    }
  });
});

describe("icon files parse", () => {
  it.each(svgFiles)("%s", (file) => {
    expect(parseProblem(read(file))).toBeNull();
  });

  it("reports a document that is not well formed", () => {
    expect(
      parseProblem('<svg xmlns="http://www.w3.org/2000/svg"><path </svg>'),
    ).not.toBeNull();
    expect(
      parseProblem('<html xmlns="http://www.w3.org/1999/xhtml"/>'),
    ).not.toBeNull();
  });
});

describe("icons share the tile shape", () => {
  it.each(svgFiles)("%s", (file) => {
    const text = read(file);
    expect(tileProblems(text)).toEqual([]);
    const ratio = motifContrast(text);
    expect(
      ratio,
      `${file} has no hex fill or stroke after the tile`,
    ).not.toBeNull();
    expect(ratio!, `${file} motif against its tile`).toBeGreaterThanOrEqual(3);
  });

  it("fails a tile that is not the shape, and a motif that does not show", () => {
    const wrap = (
      body: string,
      tile = '<rect width="96" height="96" rx="20" fill="#2C001E"/>',
    ) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">${tile}${body}</svg>`;
    const motif = '<circle cx="48" cy="48" r="20" fill="#F7F7F7"/>';
    expect(tileProblems(wrap(motif))).toEqual([]);
    expect(
      tileProblems(
        wrap(motif, '<rect width="96" height="96" rx="4" fill="#2C001E"/>'),
      ),
    ).not.toEqual([]);
    expect(
      tileProblems(
        wrap(motif, '<rect width="96" height="96" rx="20" fill="red"/>'),
      ),
    ).not.toEqual([]);
    expect(
      tileProblems(
        wrap(
          motif,
          '<rect x="2" width="96" height="96" rx="20" fill="#2C001E"/>',
        ),
      ),
    ).not.toEqual([]);
    expect(
      tileProblems(wrap(motif, '<circle r="3" fill="#2C001E"/>')),
    ).not.toEqual([]);

    expect(motifContrast(wrap(motif))!).toBeGreaterThanOrEqual(3);
    // A motif drawn first in #3A0A2A on #2C001E is nearly invisible.
    expect(motifContrast(wrap('<circle r="9" fill="#3A0A2A"/>'))!).toBeLessThan(
      3,
    );
    // fill="none" names no colour, so the stroke is the first one.
    expect(
      motifContrast(wrap('<path d="M0 0" fill="none" stroke="#F7F7F7"/>'))!,
    ).toBeGreaterThanOrEqual(3);
  });
});
