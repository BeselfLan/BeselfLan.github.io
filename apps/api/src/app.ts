import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Config } from "./config.ts";
import type { MediaManifest } from "./contentSchema.ts";
import { corsMiddleware } from "./middleware/cors.ts";
import { errorHandler, notFound } from "./middleware/errors.ts";
import { healthRouter } from "./routes/health.ts";
import { mediaRouter } from "./routes/media.ts";
import { loadManifest } from "./services/media.ts";

export interface AppDeps {
  config: Config;
  version: string;
  readManifest?: () => Promise<MediaManifest>;
  serveFiles?: boolean;
  logLevel?: string;
}

export function createApp(deps: AppDeps): express.Express {
  const { config, version } = deps;
  const readManifest =
    deps.readManifest ?? (() => loadManifest(config.MEDIA_DIR));
  const app = express();
  app.use(
    pinoHttp({
      level: deps.logLevel ?? "info",
      redact: ["req.headers.authorization", "req.headers.cookie"],
    }),
  );
  app.use(helmet());
  app.use(corsMiddleware(config.CORS_ORIGINS));
  app.use(mediaRouter({ config, readManifest, serveFiles: deps.serveFiles }));
  app.use(healthRouter({ version, readManifest }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
