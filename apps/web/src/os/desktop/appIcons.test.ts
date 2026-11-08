import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { apps } from "@/os/apps/registry";

// The app icons under public/icons/apps (D17 as amended, #99): one original
// tile family, checked here instead of by eye. jsdom, not node, because
// DOMParser reads the XML. This copies the approach of the entry icons' test
// in apps/projects, and imports nothing from that folder.

const publicDir = join(import.meta.dirname, "../../../public") + "/";
const iconsDir = `${publicDir}icons/apps/`;
const svgFiles = readdirSync(iconsDir)
  .filter((f) => f.endsWith(".svg"))
  .sort();
const read = (file: string) => readFileSync(`${iconsDir}${file}`, "utf8");

const HEX = /^#[0-9a-fA-F]{6}$/;
const GLYPH = "#F7F7F7";

// WCAG 2.x, written out here: relative luminance of a #RRGGBB colour, then
// (lighter + 0.05) / (darker + 0.05).
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const BANNED = [
  "<text",
  "<image",
  "href",
  "<linearGradient",
  "<radialGradient",
  "<filter",
  "<style",
  " style=",
  "<script",
  "<foreignObject",
  "url(",
];
const BRANDS = ["ubuntu", "gnome", "yaru"];

/** What is wrong with one icon file's text. [] when it is in the family. */
function problems(text: string, bytes = text.length): string[] {
  const out: string[] = [];
  let root: Element;
  try {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    if (doc.querySelector("parsererror")) return ["does not parse"];
    root = doc.documentElement;
  } catch {
    return ["does not parse"];
  }
  if (root.localName !== "svg") return ["root is not svg"];
  if (root.getAttribute("viewBox") !== "0 0 96 96") out.push("viewBox");
  // Without a size an <img> can read a natural width of 0.
  if (root.getAttribute("width") !== "96") out.push("width");
  if (root.getAttribute("height") !== "96") out.push("height");

  const tile = root.firstElementChild;
  if (!tile || tile.localName !== "rect") {
    out.push("first child is not a rect");
  } else {
    if (tile.getAttribute("width") !== "96") out.push("tile width");
    if (tile.getAttribute("height") !== "96") out.push("tile height");
    if (tile.getAttribute("rx") !== "22") out.push("tile rx");
    if (!HEX.test(tile.getAttribute("fill") ?? "")) out.push("tile fill");
  }

  for (const el of Array.from(root.querySelectorAll("[stroke]"))) {
    const stroke = el.getAttribute("stroke");
    if (stroke !== GLYPH && stroke !== "none") out.push(`stroke ${stroke}`);
  }
  for (const word of BANNED) {
    if (text.includes(word)) out.push(`contains ${word}`);
  }
  for (const brand of BRANDS) {
    if (text.toLowerCase().includes(brand)) out.push(`names ${brand}`);
  }
  if (bytes >= 3 * 1024) out.push("3 KB or more");
  return out;
}

const tileFill = (text: string): string =>
  new DOMParser()
    .parseFromString(text, "image/svg+xml")
    .documentElement.firstElementChild?.getAttribute("fill") ?? "";

describe("app icon files", () => {
  it("every registered app has its icon", () => {
    expect(apps.length).toBeGreaterThanOrEqual(5);
    for (const app of apps) {
      expect(existsSync(`${publicDir}${app.icon}`), app.icon).toBe(true);
    }
  });

  it("has no stray file beside the registered icons", () => {
    expect(svgFiles).toEqual(
      apps.map((a) => a.icon.replace("/icons/apps/", "")).sort(),
    );
  });
});

describe("the icons are one original set", () => {
  it.each(svgFiles)("%s is in the family", (file) => {
    expect(problems(read(file), statSync(`${iconsDir}${file}`).size)).toEqual(
      [],
    );
  });

  it("gives each tile its own fill", () => {
    const fills = svgFiles.map((f) => tileFill(read(f)).toUpperCase());
    expect(fills).toHaveLength(5);
    expect(new Set(fills).size).toBe(fills.length);
  });

  it("keeps the glyph readable on every tile at 44 px", () => {
    for (const file of svgFiles) {
      const fill = tileFill(read(file));
      expect(
        contrast(GLYPH, fill),
        `${file} on ${fill}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("measures contrast the WCAG way", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    // The same either way round.
    expect(contrast("#E95420", GLYPH)).toBeCloseTo(contrast(GLYPH, "#E95420"));
    // A glyph close to its tile would fail the readable-at-44-px check.
    expect(contrast("#F7F7F7", "#E0E0E0")).toBeLessThan(3);
  });

  it("rejects what is not in the family", () => {
    const wrap = (
      body: string,
      tile = '<rect width="96" height="96" rx="22" fill="#772953"/>',
      root = 'xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"',
    ) => `<svg ${root}>${tile}${body}</svg>`;
    const glyph =
      '<circle cx="48" cy="48" r="12" fill="none" stroke="#F7F7F7" stroke-width="6"/>';
    expect(problems(wrap(glyph))).toEqual([]);

    const bad: [string, string][] = [
      ["not xml", "<svg><path </svg>"],
      [
        "another viewBox",
        wrap(
          glyph,
          undefined,
          'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"',
        ),
      ],
      [
        "a square tile",
        wrap(glyph, '<rect width="96" height="96" rx="4" fill="#772953"/>'),
      ],
      [
        "a named tile colour",
        wrap(glyph, '<rect width="96" height="96" rx="22" fill="red"/>'),
      ],
      ["a circle for a tile", wrap(glyph, '<circle r="48" fill="#772953"/>')],
      ["another stroke colour", wrap(glyph.replace("#F7F7F7", "#FF0000"))],
      ["text", wrap('<text x="8" y="48">A</text>')],
      ["a raster", wrap('<image href="data:image/png;base64,AAAA"/>')],
      ["a gradient", wrap('<linearGradient id="g"/>')],
      ["a filter", wrap('<filter id="f"/>')],
      ["an inline style", wrap('<circle style="fill:#fff" r="3"/>')],
      ["a style element", wrap("<style>circle{fill:#fff}</style>")],
      ["a brand name", wrap('<circle r="3" id="Yaru-mark"/>')],
    ];
    for (const [name, text] of bad) {
      expect(problems(text), name).not.toEqual([]);
    }
    expect(problems(wrap(glyph), 3 * 1024)).toEqual(["3 KB or more"]);
  });
});
