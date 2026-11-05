import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

// An empty string counts as unset, because .env files often hold `KEY=`.
const optionalKey = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const origins = z
  .string()
  .transform((v) =>
    v
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o !== ""),
  )
  .pipe(
    z
      .array(
        // Matching is exact, so an origin with a trailing slash would
        // silently never match.
        z.string().refine((o) => !o.endsWith("/"), "no trailing slash"),
      )
      .min(1),
  );

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  CORS_ORIGINS: origins,
  MEDIA_DIR: z.string().min(1),
  // Not z.httpUrl(): it requires a dotted domain, which rejects localhost.
  PUBLIC_MEDIA_BASE_URL: z.url({ protocol: /^https?$/ }),
  RESEND_API_KEY: optionalKey,
  CONTACT_TO: optionalKey,
  ADMIN_TOKEN: optionalKey,
  DMOJ_USER: optionalKey,
  GITHUB_USER: optionalKey,
});

export type Config = z.infer<typeof ConfigSchema>;

/** Throws on a missing or invalid required key. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return ConfigSchema.parse(env);
}

/**
 * Version from the nearest package.json at or above `startDir`. The file sits
 * at apps/api/src under tsx and deeper under dist once built, so no fixed path.
 */
export function readVersion(startDir: string): string {
  let dir = startDir;
  for (;;) {
    const file = join(dir, "package.json");
    if (existsSync(file)) {
      const pkg: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (
        typeof pkg === "object" &&
        pkg !== null &&
        "version" in pkg &&
        typeof pkg.version === "string"
      ) {
        return pkg.version;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no package.json above ${startDir}`);
    dir = parent;
  }
}
