import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeApp } from "./helpers.ts";

// <tmp>/secret.txt, <tmp>/mid/secret.txt, <tmp>/mid/media/clip.txt,
// <tmp>/mid/media/sub/x.txt. MEDIA_DIR is <tmp>/mid/media.
let tmp: string;
const app = (serveFiles?: boolean) =>
  makeApp({ MEDIA_DIR: join(tmp, "mid/media") }, { serveFiles });

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "files-"));
  mkdirSync(join(tmp, "mid/media/sub"), { recursive: true });
  writeFileSync(join(tmp, "secret.txt"), "secret-marker");
  writeFileSync(join(tmp, "mid/secret.txt"), "secret-marker");
  writeFileSync(join(tmp, "mid/media/clip.txt"), "abcdefghij");
  writeFileSync(join(tmp, "mid/media/sub/x.txt"), "x");
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("file fallback", () => {
  it("dev fallback serves ranges", async () => {
    const res = await request(app(true))
      .get("/media/files/clip.txt")
      .set("Range", "bytes=2-5");
    expect(res.status).toBe(206);
    expect(res.text).toBe("cdef");
    expect(res.headers["content-range"]).toBe("bytes 2-5/10");
  });

  it.each([false, undefined])("no fallback in production: %s", async (flag) => {
    const res = await request(app(flag)).get("/media/files/clip.txt");
    expect(res.status).toBe(404);
  });

  it.each(["..%2fsecret.txt", "..%2f..%2fsecret.txt", "%2e%2e%2fsecret.txt"])(
    "no traversal: %s",
    async (path) => {
      const a = app(true);
      const res = await request(a).get(`/media/files/${path}`);
      expect(res.status).toBe(404);
      expect(res.text).not.toContain("secret-marker");
      // Proves the fallback was on.
      expect((await request(a).get("/media/files/clip.txt")).status).toBe(200);
    },
  );

  it("the fallback alone relaxes the resource policy", async () => {
    const a = app(true);
    const file = await request(a)
      .get("/media/files/clip.txt")
      .set("Range", "bytes=2-5");
    expect(file.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    const health = await request(a).get("/health");
    expect(health.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it.each([
    ["Range", "bytes=50-60", 416],
    ["If-Match", '"nope"', 412],
  ])("a bad range or precondition is not a 500: %s", async (h, v, status) => {
    const res = await request(app(true)).get("/media/files/clip.txt").set(h, v);
    expect(res.status).toBe(status);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.error.code).toBe("bad_file_request");
    if (status === 416) expect(res.headers["content-range"]).toBe("bytes */10");
  });

  it("an index file and a dotfile are not served", async () => {
    writeFileSync(join(tmp, "mid/media/sub/index.html"), "index-marker");
    writeFileSync(join(tmp, "mid/media/.env"), "dotfile-marker");
    const a = app(true);
    for (const path of ["sub/", ".env"]) {
      const res = await request(a).get(`/media/files/${path}`);
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toMatch(/json/);
      expect(res.text).not.toContain("index-marker");
      expect(res.text).not.toContain("dotfile-marker");
    }
  });

  it("a directory is a JSON 404", async () => {
    const res = await request(app(true)).get("/media/files/sub");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.error).toBeDefined();
  });
});
