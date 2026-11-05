import { Router } from "express";
import type { MediaManifest } from "../contentSchema.ts";

export function healthRouter(deps: {
  version: string;
  readManifest: () => Promise<MediaManifest>;
}): Router {
  const router = Router();
  // Read per request: sync.sh rewrites the manifest while the server runs.
  router.get("/health", async (_req, res) => {
    const manifest = await deps.readManifest();
    res.json({ ok: true, version: deps.version, mediaCount: manifest.length });
  });
  return router;
}
