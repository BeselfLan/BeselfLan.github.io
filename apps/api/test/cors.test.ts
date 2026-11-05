import request from "supertest";
import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers.ts";

const preflight = (app: ReturnType<typeof makeApp>, origin: string) =>
  request(app)
    .options("/health")
    .set("Origin", origin)
    .set("Access-Control-Request-Method", "GET");

describe("cors", () => {
  it.each(["https://a.test", "https://b.test"])(
    "allows each listed origin: %s",
    async (origin) => {
      const app = makeApp({ CORS_ORIGINS: "https://a.test,https://b.test" });
      const res = await preflight(app, origin);
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
    },
  );

  it.each([
    "https://beselflan.github.io.evil.test",
    "https://evil-beselflan.github.io",
    "https://beselflan.github.io/",
    "http://beselflan.github.io",
  ])("rejects near misses: %s", async (origin) => {
    const app = makeApp({ CORS_ORIGINS: "https://beselflan.github.io" });
    const res = await preflight(app, origin);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("varies by origin", async () => {
    const res = await preflight(makeApp(), "https://a.test");
    expect(res.headers["vary"]).toMatch(/Origin/i);
  });
});
