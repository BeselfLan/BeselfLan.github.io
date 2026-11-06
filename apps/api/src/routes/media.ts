import { Router } from "express";
import type { Config } from "../config.ts";
import type { MediaManifest } from "../contentSchema.ts";
import { ApiError } from "../middleware/errors.ts";
import { withAbsoluteUrls } from "../services/media.ts";
import { createLocalDisk } from "../storage/localDisk.ts";

export function mediaRouter(deps: {
  config: Config;
  readManifest: () => Promise<MediaManifest>;
  serveFiles?: boolean;
}): Router {
  const router = Router();
  // The one line to change when another adapter is used.
  const storage = createLocalDisk(
    deps.config.MEDIA_DIR,
    deps.config.PUBLIC_MEDIA_BASE_URL,
  );

  // Read per request: the manifest on the volume is rewritten while running.
  // The list is returned as stored, with names relative to the media dir.
  router.get("/api/media", async (_req, res) => {
    res.json(await deps.readManifest());
  });

  router.get("/api/media/:id", async (req, res) => {
    const entry = (await deps.readManifest()).find(
      (e) => e.id === req.params.id,
    );
    if (!entry) throw new ApiError(404, "media_not_found", "Media not found");
    res.json(withAbsoluteUrls(entry, storage));
  });

  return router;
}
