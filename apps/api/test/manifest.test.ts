import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadManifest } from "../src/services/media.ts";

const entry = {
  id: "demo",
  sources: [{ src: "media/demo.webm", type: "video/webm" }],
  poster: "media/demo.jpg",
  width: 640,
  height: 360,
  durationMs: 1000,
};

function dirWith(content?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "manifest-"));
  if (content !== undefined) writeFileSync(join(dir, "manifest.json"), content);
  return dir;
}

describe("loadManifest", () => {
  it("reads a valid manifest", async () => {
    const dir = dirWith(JSON.stringify([entry]));
    expect(await loadManifest(dir)).toHaveLength(1);
  });

  it("uses the shared schema", async () => {
    const dir = dirWith(JSON.stringify([{ ...entry, id: "Not Kebab" }]));
    await expect(loadManifest(dir)).rejects.toThrow(join(dir, "manifest.json"));
  });

  it("a missing file is empty", async () => {
    expect(await loadManifest(dirWith())).toEqual([]);
  });

  it("bad JSON names the file", async () => {
    const dir = dirWith("{");
    await expect(loadManifest(dir)).rejects.toThrow(join(dir, "manifest.json"));
  });
});
