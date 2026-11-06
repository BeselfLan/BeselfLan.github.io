import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MediaManifestSchema,
  type MediaManifest,
  type MediaManifestEntry,
} from "../contentSchema.ts";
import type { StorageAdapter } from "../storage/adapter.ts";

/**
 * Reads manifest.json in `dir`. A missing file is an empty manifest; bad JSON
 * or a schema failure throws an error that names the file.
 */
export async function loadManifest(dir: string): Promise<MediaManifest> {
  const file = join(dir, "manifest.json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`${file}: invalid JSON (${(err as Error).message})`);
  }
  const result = MediaManifestSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`${file}: ${result.error.message}`);
  }
  return result.data;
}

/** A copy of `entry` whose source and poster names are absolute URLs. */
export function withAbsoluteUrls(
  entry: MediaManifestEntry,
  storage: Pick<StorageAdapter, "publicUrl">,
): MediaManifestEntry {
  return {
    ...entry,
    sources: entry.sources.map((s) => ({
      ...s,
      src: storage.publicUrl(s.src),
    })),
    poster: storage.publicUrl(entry.poster),
  };
}
