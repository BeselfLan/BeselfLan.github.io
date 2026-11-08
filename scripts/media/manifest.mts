// Reads, checks and writes media/manifest.json. No CLI code lives here, so
// tests import it. Node runs this file directly (type stripping), so only
// erasable TypeScript: no enums, no namespaces.
import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";
import {
  MediaManifestEntrySchema,
  MediaManifestSchema,
  type MediaManifest,
  type MediaManifestEntry,
} from "../../packages/content/src/schema.ts";

// The two numbers and the length that ffprobe is asked for in convert.sh.
const ProbeSchema = z.object({
  streams: z
    .array(
      z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    )
    .min(1),
  format: z.object({ duration: z.coerce.number().positive() }),
});

/**
 * The entry convert.sh writes. Names are relative to the manifest's folder.
 * WebM comes first, so a browser that plays VP9 takes the smaller file and one
 * without it falls back to H.264.
 */
export function entryFromProbe(id: string, probe: unknown): MediaManifestEntry {
  const { streams, format } = ProbeSchema.parse(probe);
  return MediaManifestEntrySchema.parse({
    id,
    sources: [
      { src: `${id}.webm`, type: "video/webm; codecs=vp9" },
      { src: `${id}.mp4`, type: "video/mp4" },
    ],
    poster: `${id}.jpg`,
    width: streams[0].width,
    height: streams[0].height,
    durationMs: Math.round(format.duration * 1000),
  });
}

/** Replaces the entry with the same id in place, or appends. Does not mutate. */
export function upsert(
  manifest: MediaManifest,
  entry: MediaManifestEntry,
): MediaManifest {
  const at = manifest.findIndex((e) => e.id === entry.id);
  if (at === -1) return [...manifest, entry];
  return manifest.map((e, i) => (i === at ? entry : e));
}

/** A missing file is []. Bad JSON or a schema failure throws, naming the file. */
export function readManifest(file: string): MediaManifest {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
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
  if (!result.success) throw new Error(`${file}: ${result.error.message}`);
  return result.data;
}

/**
 * Validates first, then writes a temp file in the same folder and renames it.
 * The API reads the manifest on every request, so it never sees half a file.
 */
export function writeManifest(file: string, manifest: MediaManifest): void {
  const valid = MediaManifestSchema.parse(manifest);
  const temp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(valid, null, 2) + "\n", { mode: 0o644 });
    renameSync(temp, file);
  } catch (err) {
    rmSync(temp, { force: true });
    throw err;
  }
}

const isFile = (path: string) => existsSync(path) && statSync(path).isFile();

/** What would break the site. An empty array means fine. */
export function checkManifest(file: string): string[] {
  if (!existsSync(file)) return [`${file}: no such file`];
  let manifest: MediaManifest;
  try {
    manifest = readManifest(file);
  } catch (err) {
    return [(err as Error).message];
  }
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of manifest) {
    if (seen.has(entry.id)) problems.push(`duplicate id "${entry.id}"`);
    seen.add(entry.id);
    for (const name of [...entry.sources.map((s) => s.src), entry.poster]) {
      if (isAbsolute(name) || name.split(/[\\/]/).includes("..")) {
        problems.push(`"${entry.id}": "${name}" must stay inside the folder`);
      } else if (!isFile(join(dirname(file), name))) {
        problems.push(`"${entry.id}": missing file ${name}`);
      }
    }
  }
  return problems;
}
