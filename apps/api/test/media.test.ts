import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MediaManifestEntrySchema } from "../src/contentSchema.ts";
import { makeApp } from "./helpers.ts";

const entry = (id: string, over: object = {}) => ({
  id,
  sources: [
    { src: "a.webm", type: "video/webm" },
    { src: "a.mp4", type: "video/mp4" },
  ],
  poster: "a.jpg",
  width: 640,
  height: 360,
  durationMs: 4200,
  ...over,
});

let dir: string;
const write = (data: unknown) =>
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(data));
const app = () => makeApp({ MEDIA_DIR: dir });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "media-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("media routes", () => {
  it("lists the manifest", async () => {
    // Ids are not in alphabetical order, so a sort fails.
    const manifest = [entry("zeta"), entry("alpha")];
    write(manifest);
    const res = await request(app()).get("/api/media");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(manifest);
  });

  it("resolves absolute URLs", async () => {
    write([entry("demo")]);
    const res = await request(app()).get("/api/media/demo");
    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual([
      { src: "https://media.test/files/a.webm", type: "video/webm" },
      { src: "https://media.test/files/a.mp4", type: "video/mp4" },
    ]);
    expect(res.body.poster).toBe("https://media.test/files/a.jpg");
    expect(res.body).toMatchObject({
      width: 640,
      height: 360,
      durationMs: 4200,
    });
  });

  it("response still matches the schema", async () => {
    write([entry("demo")]);
    const res = await request(app()).get("/api/media/demo");
    expect(MediaManifestEntrySchema.safeParse(res.body).success).toBe(true);
  });

  it("404 for an unknown id", async () => {
    write([entry("deadknight")]);
    const res = await request(app()).get("/api/media/dead");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "media_not_found", message: "Media not found" },
    });
  });

  it("sees a new manifest without a restart", async () => {
    write([entry("one")]);
    const a = app();
    expect((await request(a).get("/api/media/one")).status).toBe(200);
    write([entry("two")]);
    expect((await request(a).get("/api/media/two")).status).toBe(200);
    expect((await request(a).get("/api/media/one")).status).toBe(404);
  });

  it("bad manifest at request time", async () => {
    write([entry("one")]);
    const a = app();
    write([entry("one", { width: -1 })]);
    const bad = await request(a).get("/api/media");
    expect(bad.status).toBe(500);
    expect(bad.headers["content-type"]).toMatch(/json/);
    expect(bad.body.error.code).toBe("internal_error");
    expect(bad.text).not.toContain(dir);
    write([entry("one")]);
    expect((await request(a).get("/api/media")).status).toBe(200);
  });

  it("no manifest yet", async () => {
    const a = app();
    const list = await request(a).get("/api/media");
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    const one = await request(a).get("/api/media/any");
    expect(one.status).toBe(404);
    expect(one.body.error.code).toBe("media_not_found");
  });

  it("answers the site's origin", async () => {
    write([entry("demo")]);
    const res = await request(app())
      .get("/api/media/demo")
      .set("Origin", "https://a.test");
    expect(res.headers["access-control-allow-origin"]).toBe("https://a.test");
  });

  it("a malformed escape in the id is a 400, not a logged 500", async () => {
    const lines: string[] = [];
    const a = makeApp(
      { MEDIA_DIR: dir },
      { logLevel: "info", logStream: { write: (m) => void lines.push(m) } },
    );
    const res = await request(a).get("/api/media/%E0%A4%A");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toEqual({
      error: { code: "bad_request", message: "Bad request" },
    });
    expect(lines.length).toBeGreaterThan(0);
    // pino level 50 is error.
    for (const line of lines) expect(JSON.parse(line).level).toBeLessThan(50);
  });
});
