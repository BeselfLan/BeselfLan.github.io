import { MediaManifestEntrySchema, type MediaId } from "@beself/content";
import type { MediaProvider, MediaStatus, ResolvedMedia } from "./provider";

/** How long the API has to answer, headers and body, before the fallback is asked. */
export const API_TIMEOUT_MS = 3000;

export interface ApiMediaOptions {
  /** The API origin, with no trailing slash (index.ts cleans it). */
  baseUrl: string;
  /** Asked for the answer whenever the API cannot give one (D11). */
  fallback: MediaProvider;
  /** Read when it is called, so a test can stub the global. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function isAbsoluteHttp(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Plan 5.6, D11: asks `GET {baseUrl}/api/media/{id}` and gives up after
 * API_TIMEOUT_MS.
 *
 * - 200 with a valid entry for this id: online, cached for the life of the page.
 * - 404: online, and null. The API is up and says this media does not exist,
 *   so the fallback is not asked.
 * - Anything else (a rejection, an abort, another status, a bad body): offline,
 *   and the fallback's answer. Nothing is cached.
 *
 * The status is the API's own: "is the API reachable", not the fallback's. It
 * is "unknown" until the first answer, and nothing is fetched before a
 * `resolve`. It never rejects on its own errors.
 */
export function createApiMediaProvider(
  options: ApiMediaOptions,
): MediaProvider {
  let status: MediaStatus = "unknown";
  const cache = new Map<string, ResolvedMedia>();

  return {
    async resolve(id: MediaId): Promise<ResolvedMedia | null> {
      const cached = cache.get(id);
      if (cached) return cached;

      const controller = new AbortController();
      // setTimeout with an AbortController, not AbortSignal.timeout(): fake
      // timers control this one.
      const timer = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? API_TIMEOUT_MS,
      );
      try {
        // A plain function call with a string URL: a browser throws "Illegal
        // invocation" when the global fetch runs as a method of another object.
        // Accept is CORS-safelisted, so this cross-origin GET needs no preflight.
        // Add no other header.
        const f = options.fetch ?? globalThis.fetch;
        const res = await f(
          `${options.baseUrl}/api/media/${encodeURIComponent(id)}`,
          {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );
        if (res.status === 404) {
          status = "online";
          return null;
        }
        // This route answers only 200 or a JSON 404, so any other status came
        // from a proxy or an error page.
        if (res.status !== 200) throw new Error(`API answered ${res.status}`);
        const entry = MediaManifestEntrySchema.parse(await res.json());
        if (entry.id !== id) throw new Error(`API answered for ${entry.id}`);
        if (
          !isAbsoluteHttp(entry.poster) ||
          !entry.sources.every((source) => isAbsoluteHttp(source.src))
        ) {
          throw new Error("API answered with names that are not absolute URLs");
        }
        status = "online";
        cache.set(id, entry);
        return entry;
      } catch {
        status = "offline";
        return options.fallback.resolve(id);
      } finally {
        // After the body has been read: a server that sends headers and then
        // stalls is abandoned too.
        clearTimeout(timer);
      }
    },
    status: () => status,
  };
}
