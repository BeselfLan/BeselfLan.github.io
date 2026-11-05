import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, readVersion } from "../src/config.ts";

const valid = {
  PORT: "8123",
  CORS_ORIGINS: "https://a.test",
  MEDIA_DIR: "/tmp/media",
  PUBLIC_MEDIA_BASE_URL: "https://media.test/files",
};

describe("loadConfig", () => {
  it.each(Object.keys(valid))("rejects a missing required key: %s", (key) => {
    const env: Record<string, string> = { ...valid };
    delete env[key];
    expect(() => loadConfig(env)).toThrow();
  });

  it("parses values", () => {
    const c = loadConfig({
      ...valid,
      CORS_ORIGINS: "https://a.test,https://b.test",
    });
    expect(c.CORS_ORIGINS).toEqual(["https://a.test", "https://b.test"]);
    expect(c.PORT).toBe(8123);
    expect(() => loadConfig({ ...valid, PORT: "abc" })).toThrow();
  });

  it("keeps optional keys", () => {
    const keys = [
      "RESEND_API_KEY",
      "CONTACT_TO",
      "ADMIN_TOKEN",
      "DMOJ_USER",
      "GITHUB_USER",
    ] as const;
    const c = loadConfig(valid);
    for (const k of keys) expect(c[k]).toBeUndefined();
    expect(loadConfig({ ...valid, DMOJ_USER: "someone" }).DMOJ_USER).toBe(
      "someone",
    );
  });

  it("rejects an origin with a trailing slash", () => {
    expect(() =>
      loadConfig({ ...valid, CORS_ORIGINS: "https://a.test/" }),
    ).toThrow();
  });

  it("treats an empty optional key as unset", () => {
    expect(loadConfig({ ...valid, DMOJ_USER: "" }).DMOJ_USER).toBeUndefined();
  });

  it("accepts localhost but only http and https", () => {
    const url = (u: string) => ({ ...valid, PUBLIC_MEDIA_BASE_URL: u });
    expect(() =>
      loadConfig(url("http://localhost:8080/media/files")),
    ).not.toThrow();
    expect(() => loadConfig(url("ftp://media.test/files"))).toThrow();
  });
});

describe("readVersion", () => {
  it("walks up to package.json", () => {
    const root = mkdtempSync(join(tmpdir(), "version-"));
    writeFileSync(join(root, "package.json"), '{"version":"7.7.7"}');
    const deep = join(root, "a", "b");
    mkdirSync(deep, { recursive: true });
    expect(readVersion(deep)).toBe("7.7.7");
  });
});
