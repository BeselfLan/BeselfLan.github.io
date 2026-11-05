import { createApp, type AppDeps } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";

export const baseEnv = {
  PORT: "8123",
  CORS_ORIGINS: "https://a.test",
  MEDIA_DIR: "/tmp/does-not-exist",
  PUBLIC_MEDIA_BASE_URL: "https://media.test/files",
};

export function makeApp(
  env: Partial<Record<string, string>> = {},
  deps: Partial<AppDeps> = {},
) {
  return createApp({
    config: loadConfig({ ...baseEnv, ...env }),
    version: "1.2.3",
    logLevel: "silent",
    ...deps,
  });
}
