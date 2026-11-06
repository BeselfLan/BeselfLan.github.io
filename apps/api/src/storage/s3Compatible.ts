import type { StorageAdapter } from "./adapter.ts";

const notConfigured = (): never => {
  throw new Error("S3-compatible storage is not configured");
};

/** A typed placeholder: every method throws until a backend is wired in. */
export function createS3Compatible(): StorageAdapter {
  return {
    list: notConfigured,
    exists: notConfigured,
    publicUrl: notConfigured,
    putStream: notConfigured,
  };
}
