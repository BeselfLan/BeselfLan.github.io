import type { Readable } from "node:stream";

/** Where media files live. Keys are `/`-separated paths below the media root. */
export interface StorageAdapter {
  list(): Promise<string[]>;
  exists(key: string): Promise<boolean>;
  publicUrl(key: string): string;
  putStream(key: string, stream: Readable): Promise<void>;
}
