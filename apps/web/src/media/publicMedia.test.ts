// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { content, MediaManifestSchema } from "@beself/content";
import { describe, expect, it } from "vitest";

// Guards the demos that ship in apps/web/public/media (plan 5.6, D11): the
// static provider plays them while no backend is deployed. These are the files
// scripts/media/convert.sh wrote at #120's budget; the checks below keep the
// folder's contents, shape and weight from drifting. Plan 7.7 later removes
// the MP4s, and will update this file with that change.

const dir = fileURLToPath(new URL("../../public/media/", import.meta.url));
const manifest = MediaManifestSchema.parse(
  JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")),
);

const names = manifest.flatMap((m) => [
  ...m.sources.map((s) => s.src),
  m.poster,
]);
const bytesOf = (file: string): number => statSync(join(dir, file)).size;
const startOf = (file: string, length: number): Buffer =>
  readFileSync(join(dir, file)).subarray(0, length);

describe("the manifest", () => {
  it("parses, with the demos the content uses", () => {
    // MediaManifestSchema parsed it above; a bad file already failed the run.
    expect(manifest.map((m) => m.id).sort()).toEqual([
      "3d-engine",
      "deadknight",
      "fnaf",
    ]);
    // Both ways: an entry whose video has no files, and a demo no entry plays.
    const used = new Set(
      content.entries.flatMap((e) => (e.media?.video ? [e.media.video] : [])),
    );
    expect(manifest.map((m) => m.id).sort()).toEqual([...used].sort());
  });

  it("lists each entry as a WebM, then an MP4, with a JPEG poster", () => {
    for (const m of manifest) {
      expect(m.sources, m.id).toEqual([
        { src: `${m.id}.webm`, type: "video/webm; codecs=vp9" },
        { src: `${m.id}.mp4`, type: "video/mp4" },
      ]);
      expect(m.poster, m.id).toBe(`${m.id}.jpg`);
    }
  });
});

describe("the folder", () => {
  it("holds exactly the named files, none empty", () => {
    // readdirSync lists dotfiles and folders too, so a leftover .convert-*
    // folder or a stray .gif fails here.
    expect(readdirSync(dir).sort()).toEqual(["manifest.json", ...names].sort());
    for (const file of readdirSync(dir)) {
      expect(bytesOf(file), file).toBeGreaterThan(0);
    }
  });

  it("has files that are what their names say", () => {
    // The first bytes only: this catches a renamed GIF or a rendition in the
    // wrong container, which a size check would not.
    for (const m of manifest) {
      // The EBML header of WebM.
      expect(startOf(`${m.id}.webm`, 4), `${m.id}.webm`).toEqual(
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      );
      // MP4 has the box type "ftyp" at byte 4.
      expect(
        startOf(`${m.id}.mp4`, 8).subarray(4).toString("latin1"),
        `${m.id}.mp4`,
      ).toBe("ftyp");
      // JPEG starts with the SOI marker and the first marker's 0xFF.
      expect(startOf(`${m.id}.jpg`, 3), `${m.id}.jpg`).toEqual(
        Buffer.from([0xff, 0xd8, 0xff]),
      );
    }
  });

  it("fits #120's budget", () => {
    // convert.sh's default MEDIA_MAX_BYTES is 1,500,000 for each MP4 and each
    // WebM. The pre-#120 set had deadknight.mp4 at about 3.5 MB, fnaf.webm at
    // about 2.8 MB and 10.4 MB in all, and git keeps whatever is committed.
    for (const file of names) {
      const limit = file.endsWith(".jpg") ? 200_000 : 1_500_000;
      expect(bytesOf(file), file).toBeLessThanOrEqual(limit);
    }
    const total = readdirSync(dir).reduce((sum, f) => sum + bytesOf(f), 0);
    expect(total).toBeLessThanOrEqual(6_000_000);
  });
});
