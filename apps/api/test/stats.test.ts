import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createStatsCache,
  fetchJson,
  type FetchJson,
} from "../src/services/stats.ts";
import { makeApp } from "./helpers.ts";

const users = { DMOJ_USER: "user-marker", GITHUB_USER: "other-marker" };
const routes = [
  ["dmoj", "/api/stats/dmoj", "DMOJ_USER", "GITHUB_USER"],
  ["github", "/api/stats/github", "GITHUB_USER", "DMOJ_USER"],
] as const;
const MIN = 60_000;

const fetchMock = vi.fn();
const load = vi.fn<FetchJson>(async () => ({ marker: 1 }));
let clock = 1000;
const app = (env: Record<string, string> = users) =>
  makeApp(env, { fetchJson: load, now: () => clock });

beforeEach(() => {
  clock = 1000;
  load.mockClear();
  load.mockImplementation(async () => ({ marker: 1 }));
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => {
    throw new Error("unexpected network call");
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("stats routes", () => {
  it.each(routes)("caches for 10 minutes: %s", async (_n, path) => {
    const a = app();
    await Promise.all([request(a).get(path), request(a).get(path)]);
    expect(load).toHaveBeenCalledTimes(1);
    clock += 9 * MIN + 59_000;
    await request(a).get(path);
    expect(load).toHaveBeenCalledTimes(1);
    clock += 2_000;
    await request(a).get(path);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each(routes)("returns the upstream payload: %s", async (_n, path) => {
    load.mockResolvedValue({ unique: "payload-marker" });
    const res = await request(app()).get(path);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ unique: "payload-marker" });
  });

  it("uses the configured user", async () => {
    const a = app();
    await request(a).get("/api/stats/dmoj");
    await request(a).get("/api/stats/github");
    const urls = load.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      "https://dmoj.ca/api/v2/user/user-marker",
      "https://api.github.com/users/other-marker/repos?per_page=100&sort=pushed",
    ]);
  });

  it("each route has its own cache entry", async () => {
    const a = app();
    await request(a).get("/api/stats/dmoj");
    await request(a).get("/api/stats/github");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each(routes)("does not cache failures: %s", async (_n, path) => {
    load.mockRejectedValueOnce(new Error("upstream-marker"));
    const a = app();
    const bad = await request(a).get(path);
    expect(bad.status).toBe(502);
    expect(bad.body.error.code).toBe("stats_unavailable");
    expect(bad.text).not.toContain("upstream-marker");
    const good = await request(a).get(path);
    expect(good.status).toBe(200);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each(routes)("degrades when unset: %s", async (_n, path, _key, other) => {
    const res = await request(app({ [other]: "x" })).get(path);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("stats_not_configured");
    expect(load).not.toHaveBeenCalled();
  });
});

describe("stats cache", () => {
  it("two calls at once share one upstream call", async () => {
    let release!: (v: unknown) => void;
    const slow = vi.fn(
      () => new Promise<unknown>((resolve) => (release = resolve)),
    );
    const cache = createStatsCache(slow, () => clock);
    const a = cache.fetch("u");
    const b = cache.fetch("u");
    release({ v: 1 });
    expect(await a).toBe(await b);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it("fetchJson rejects a non-2xx response", async () => {
    fetchMock.mockResolvedValue(new Response("x", { status: 503 }));
    await expect(fetchJson("https://up.test/x")).rejects.toThrow(/503/);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toBeTruthy();
  });
});
