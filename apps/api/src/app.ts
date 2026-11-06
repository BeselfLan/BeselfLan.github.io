import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Config } from "./config.ts";
import type { MediaManifest } from "./contentSchema.ts";
import { corsMiddleware } from "./middleware/cors.ts";
import { errorHandler, notFound } from "./middleware/errors.ts";
import { contactRouter, type SendMail } from "./routes/contact.ts";
import { statsRouter, type FetchJson } from "./routes/stats.ts";
import { healthRouter } from "./routes/health.ts";
import { mediaRouter } from "./routes/media.ts";
import { loadManifest } from "./services/media.ts";

export interface AppDeps {
  config: Config;
  version: string;
  readManifest?: () => Promise<MediaManifest>;
  serveFiles?: boolean;
  logLevel?: string;
  logStream?: { write(msg: string): void };
  sendMail?: SendMail;
  fetchJson?: FetchJson;
  now?: () => number;
}

export function createApp(deps: AppDeps): express.Express {
  const { config, version } = deps;
  const readManifest =
    deps.readManifest ?? (() => loadManifest(config.MEDIA_DIR));
  const app = express();
  // One hop, for the front proxy. `true` would let a client spoof its IP.
  app.set("trust proxy", 1);
  app.use(
    pinoHttp({
      level: deps.logLevel ?? "info",
      redact: ["req.headers.authorization", "req.headers.cookie"],
      stream: deps.logStream,
    }),
  );
  app.use(helmet());
  app.use(corsMiddleware(config.CORS_ORIGINS));
  app.use(mediaRouter({ config, readManifest, serveFiles: deps.serveFiles }));
  app.use(healthRouter({ version, readManifest }));
  app.use(contactRouter({ config, sendMail: deps.sendMail }));
  app.use(statsRouter({ config, fetchJson: deps.fetchJson, now: deps.now }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
