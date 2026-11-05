import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers.ts";

const entry = (id: string) => ({
  id,
  sources: [{ src: `media/${id}.webm`, type: "video/webm" }],
  poster: `media/${id}.jpg`,
  width: 640,
  height: 360,
  durationMs: 1000,
});

describe("health", () => {
  it("counts the manifest on every request", async () => {
    const dir = mkdtempSync(join(tmpdir(), "health-"));
    const file = join(dir, "manifest.json");
    const app = makeApp({ MEDIA_DIR: dir });
    const count = async () =>
      (await request(app).get("/health")).body.mediaCount;

    writeFileSync(file, JSON.stringify([entry("a"), entry("b")]));
    expect(await count()).toBe(2);
    writeFileSync(file, JSON.stringify([entry("a"), entry("b"), entry("c")]));
    expect(await count()).toBe(3);
    rmSync(file);
    expect(await count()).toBe(0);
  });

  it("reports version", async () => {
    const res = await request(makeApp({}, { version: "9.9.9" })).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.version).toBe("9.9.9");
  });
});
