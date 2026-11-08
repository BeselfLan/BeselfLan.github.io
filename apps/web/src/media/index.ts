import { createApiMediaProvider } from "./api";
import type { MediaProvider } from "./provider";
import { createStaticMediaProvider } from "./static";

/** The origin and path of an http(s) URL, without trailing slashes, else null. */
function apiBase(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Not the string as given: a query or hash would end up before /api/media.
    // A path prefix such as https://host/v1 is kept.
    return (url.origin + url.pathname).replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Plan 4.5, D11: the API provider (with the static provider as its fallback)
 * when `apiUrl` is an http or https URL, else the static provider alone. Both
 * use `deps.fetch` when it is given. Nothing is fetched here.
 */
export function pickMediaProvider(
  apiUrl: string | undefined,
  deps: { fetch?: typeof fetch } = {},
): MediaProvider {
  const raw = apiUrl?.trim();
  const baseUrl = raw ? apiBase(raw) : null;
  const fallback = createStaticMediaProvider({ fetch: deps.fetch });
  if (baseUrl === null) return fallback;
  return createApiMediaProvider({ baseUrl, fallback, fetch: deps.fetch });
}

/**
 * Plan 4.5: the static provider while NEXT_PUBLIC_API_URL is unset (D11).
 * The env read must stay this literal expression: Next inlines only a literal
 * `process.env.NEXT_PUBLIC_*` at build time, so a destructured or computed read
 * would be undefined in the browser.
 */
export const media: MediaProvider = pickMediaProvider(
  process.env.NEXT_PUBLIC_API_URL,
);
