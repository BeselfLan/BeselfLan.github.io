import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "../src/storage/adapter.ts";
import { createS3Compatible } from "../src/storage/s3Compatible.ts";

// Typed over every method, so a new method that is not listed fails typecheck.
const calls: Record<keyof StorageAdapter, (a: StorageAdapter) => unknown> = {
  list: (a) => a.list(),
  exists: (a) => a.exists("k"),
  publicUrl: (a) => a.publicUrl("k"),
  putStream: (a) => a.putStream("k", Readable.from([])),
};

describe("s3-compatible stub", () => {
  it.each(Object.entries(calls))("%s is not configured", async (_n, call) => {
    const adapter = createS3Compatible();
    await expect((async () => call(adapter))()).rejects.toThrow(
      /not configured/,
    );
  });
});
