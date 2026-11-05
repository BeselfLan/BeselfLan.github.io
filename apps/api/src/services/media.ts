import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MediaManifestSchema, type MediaManifest } from "../contentSchema.ts";

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
