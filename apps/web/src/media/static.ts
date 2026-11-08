import {
  MediaManifestSchema,
  type MediaId,
  type MediaManifest,
} from "@beself/content";
import type { MediaProvider, MediaStatus, ResolvedMedia } from "./provider";

/** Where the manifest lives on this site (plan 5.6). */
export const MANIFEST_PATH = "/media/manifest.json";

export interface StaticMediaOptions {
  /** A path or an absolute URL. Override for a test; the default is MANIFEST_PATH. */
  manifestPath?: string;
  /** Read when it is called, so a test can stub the global. */
  fetch?: typeof fetch;
}

/**
 * Plan 5.6, D11: the provider that needs no backend. It reads the manifest the
 * site ships (`/media/manifest.json`) once per page load, at the first
 * `resolve`, and gives back entries whose names are absolute URLs resolved
 * against the manifest's folder.
 *
 * Nothing happens on import or creation (plan 9, hydration): no fetch, and no
 * read of `location`. The status is "unknown" until the manifest answers, then
 * "online" or "offline". It never rejects: a failure gives null.
 */
export function createStaticMediaProvider(
  options: StaticMediaOptions = {},
): MediaProvider {
  let status: MediaStatus = "unknown";
  let pending: Promise<MediaManifest | null> | null = null;

  // Every failure ends here as null with "offline", including a `fetch` that
  // throws before it returns a promise. This function never rejects.
  async function load(): Promise<MediaManifest | null> {
    try {
      const manifestUrl = new URL(
        options.manifestPath ?? MANIFEST_PATH,
        location.href,
      );
      // A plain function call with a string URL: a browser throws "Illegal
      // invocation" when the global fetch runs as a method of another object.
      const f = options.fetch ?? globalThis.fetch;
      const res = await f(manifestUrl.href);
      if (!res.ok) throw new Error(`manifest answered ${res.status}`);
      const manifest = MediaManifestSchema.parse(await res.json());
      const resolved = manifest.map((entry) => ({
        ...entry,
        sources: entry.sources.map(({ src, type }) => ({
          src: new URL(src, manifestUrl).href,
          type,
        })),
        poster: new URL(entry.poster, manifestUrl).href,
      }));
      status = "online";
      return resolved;
    } catch {
      status = "offline";
      return null;
    }
  }

  return {
    async resolve(id: MediaId): Promise<ResolvedMedia | null> {
      // On the server there is no page to resolve names against.
      if (typeof location === "undefined") return null;
      const loading = (pending ??= load());
      const manifest = await loading;
      // The promise is dropped here, by whoever awaited it, and never inside
      // load(): a reset inside load() runs before `??=` stores the promise when
      // fetch throws synchronously, and the failure would stay cached.
      if (manifest === null) {
        if (pending === loading) pending = null;
        return null;
      }
      return manifest.find((entry) => entry.id === id) ?? null;
    },
    status: () => status,
  };
}
