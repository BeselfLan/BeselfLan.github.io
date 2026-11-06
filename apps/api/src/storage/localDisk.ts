import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import type { StorageAdapter } from "./adapter.ts";

/** Does no I/O until a method is called. */
export function createLocalDisk(
  rootDir: string,
  baseUrl: string,
): StorageAdapter {
  const root = resolve(rootDir);
  const base = baseUrl.replace(/\/+$/, "");

  // The separator matters: without it a sibling folder whose name starts with
  // the root's name would pass. Lexical only, so symlinks are followed.
  const pathFor = (key: string): string | null => {
    const path = resolve(root, key);
    return path.startsWith(root + sep) ? path : null;
  };

  return {
    async list() {
      try {
        const found = await readdir(root, {
          recursive: true,
          withFileTypes: true,
        });
        return found
          .filter((d) => d.isFile())
          .map((d) =>
            relative(root, resolve(d.parentPath, d.name)).split(sep).join("/"),
          );
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
      }
    },
    async exists(key) {
      const path = pathFor(key);
      if (!path) return false;
      try {
        return (await stat(path)).isFile();
      } catch {
        return false;
      }
    },
    publicUrl(key) {
      return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
    },
    async putStream(key, stream) {
      const path = pathFor(key);
      if (!path) throw new Error("Key is outside the media directory");
      await mkdir(dirname(path), { recursive: true });
      await pipeline(stream, createWriteStream(path));
    },
  };
}
