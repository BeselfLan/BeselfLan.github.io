import type { MediaId, MediaManifestEntry } from "@beself/content";

export type MediaStatus = "unknown" | "online" | "offline";

/** A manifest entry whose `sources[].src` and `poster` are absolute URLs. */
export type ResolvedMedia = MediaManifestEntry;

/** Plan 4.5. */
export interface MediaProvider {
  /** Null means the media is unavailable. */
  resolve(id: MediaId): Promise<ResolvedMedia | null>;
  status(): MediaStatus;
}

/** The provider media/index.ts picks from NEXT_PUBLIC_API_URL (plan 4.5, D11). */
export { media } from "./index";
