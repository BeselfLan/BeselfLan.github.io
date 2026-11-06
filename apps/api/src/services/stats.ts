import { LRUCache } from "lru-cache";

export const STATS_TTL_MS = 10 * 60 * 1000;
export type FetchJson = (url: string) => Promise<unknown>;

/**
 * One entry per upstream URL. `fetch` shares calls that are in flight and
 * keeps no failures. The value is wrapped because cached values must be
 * non-null and an upstream may return null.
 */
export function createStatsCache(
  load: FetchJson,
  now: () => number = Date.now,
) {
  return new LRUCache<string, { body: unknown }>({
    max: 2,
    ttl: STATS_TTL_MS,
    // 0, or the cache debounces its clock on a real timer and a fake clock
    // reads stale.
    ttlResolution: 0,
    perf: { now },
    fetchMethod: async (url) => ({ body: await load(url) }),
  });
}

export const fetchJson: FetchJson = async (url) => {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "beselfos-api" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`upstream returned ${res.status}`);
  return res.json();
};
