// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SettingsSchema } from "@/os/store/settings";

// D17: the wallpapers are original art drawn for this repo. These checks keep
// a raster, a borrowed asset or a missing file from slipping in.

const IDS = SettingsSchema.shape.wallpaper.unwrap().options;

function read(id: string): string {
  const path = fileURLToPath(
    new URL(`../../../public/wallpapers/${id}.svg`, import.meta.url),
  );
  return readFileSync(path, "utf8");
}

describe("the wallpaper files", () => {
  it("cover every wallpaper the setting allows", () => {
    expect([...IDS].sort()).toEqual(["aubergine", "mono", "orange"]);
  });

  describe.each(IDS)("%s.svg", (id) => {
    const svg = read(id);

    it("is an SVG with the namespace and a gradient", () => {
      // An XML declaration may come first.
      expect(svg).toMatch(/^\s*(<\?xml[^>]*\?>\s*)?<svg\b/);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toMatch(/<(linear|radial)Gradient\b/);
      expect(svg).toContain('viewBox="0 0 1440 900"');
      expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    });

    it("has grain and blurred shapes", () => {
      expect(svg).toContain("<feTurbulence");
      const blurs = [...svg.matchAll(/stdDeviation="(\d+(?:\.\d+)?)"/g)].map(
        (m) => Number(m[1]),
      );
      expect(blurs.length).toBeGreaterThan(0);
      // A big blur makes the first paint and a resize slower.
      for (const b of blurs) expect(b).toBeLessThanOrEqual(80);
    });

    it("embeds no raster and links to no other file", () => {
      expect(svg).not.toMatch(/<image\b/i);
      expect(svg).not.toMatch(/data:/i);
      // Only fragment references such as href="#a" are allowed.
      for (const m of svg.matchAll(/href\s*=\s*["']([^"']*)["']/gi)) {
        expect(m[1].startsWith("#"), m[0]).toBe(true);
      }
    });

    it("names no other operating system or its artwork", () => {
      expect(svg).not.toMatch(/ubuntu|yaru|canonical/i);
    });

    it("is small", () => {
      expect(Buffer.byteLength(svg)).toBeLessThan(8 * 1024);
    });
  });

  it("differ from each other", () => {
    const files = IDS.map(read);
    expect(new Set(files).size).toBe(files.length);
  });
});
