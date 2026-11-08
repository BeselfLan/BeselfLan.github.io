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

/**
 * What `AppApi.media` and the tray read. A placeholder until the media child
 * (#18) swaps in the provider that `media/index.ts` picks from the environment
 * (plan 4.5): it resolves nothing and its status is unknown. `media/**` is
 * shared with app-projects so that swap needs no change to the OS.
 */
export const media: MediaProvider = {
  resolve: () => Promise.resolve(null),
  status: () => "unknown",
};
