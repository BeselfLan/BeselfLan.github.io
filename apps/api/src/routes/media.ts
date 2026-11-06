import express, { Router, type ErrorRequestHandler } from "express";
import type { Config } from "../config.ts";
import type { MediaManifest } from "../contentSchema.ts";
import { ApiError } from "../middleware/errors.ts";
import { withAbsoluteUrls } from "../services/media.ts";
import { createLocalDisk } from "../storage/localDisk.ts";

// send raises 412 and 416 after it has found the file, so serve-static hands
// them on as errors. Without this they would become 500s.
const fileClientErrors: ErrorRequestHandler = (err, _req, res, next) => {
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number" && status < 500) {
    // send has already set the file's type; the error body is JSON.
    res.removeHeader("Content-Type");
    next(new ApiError(status, "bad_file_request", "Cannot serve that request"));
    return;
  }
  next(err);
};

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

  // Development fallback with Range support. In production a front proxy
  // serves these, so the flag is off. The resource policy is relaxed here
  // only, so a page on another origin can load <video> and its poster.
  if (deps.serveFiles) {
    router.use(
      "/media/files",
      express.static(deps.config.MEDIA_DIR, {
        index: false,
        redirect: false,
        setHeaders: (res) =>
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"),
      }),
      fileClientErrors,
    );
  }

  return router;
}
