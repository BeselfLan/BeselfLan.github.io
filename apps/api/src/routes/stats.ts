import { Router } from "express";
import type { Config } from "../config.ts";
import { ApiError } from "../middleware/errors.ts";
import {
  createStatsCache,
  fetchJson as defaultFetchJson,
  type FetchJson,
} from "../services/stats.ts";

export type { FetchJson };

export function statsRouter(deps: {
  config: Config;
  fetchJson?: FetchJson;
  now?: () => number;
}): Router {
  const router = Router();
  // Built here so each app has its own cache.
  const cache = createStatsCache(deps.fetchJson ?? defaultFetchJson, deps.now);
  const routes = [
    {
      path: "/api/stats/dmoj",
      user: deps.config.DMOJ_USER,
      url: (u: string) => `https://dmoj.ca/api/v2/user/${u}`,
    },
    {
      path: "/api/stats/github",
      user: deps.config.GITHUB_USER,
      url: (u: string) =>
        `https://api.github.com/users/${u}/repos?per_page=100&sort=pushed`,
    },
  ];
  for (const route of routes) {
    router.get(route.path, async (req, res) => {
      if (!route.user) {
        throw new ApiError(
          503,
          "stats_not_configured",
          "Stats are not configured",
        );
      }
      let hit: { body: unknown } | undefined;
      try {
        hit = await cache.fetch(route.url(encodeURIComponent(route.user)));
      } catch (err) {
        req.log.error(err);
      }
      if (!hit) {
        throw new ApiError(502, "stats_unavailable", "Stats are unavailable");
      }
      res.json(hit.body);
    });
  }
  return router;
}
