"use client";

import { useSyncExternalStore } from "react";
import { media, type MediaStatus } from "@/media/provider";

/** How often the status is read again. Override: change it; #18 may add a subscription. */
export const MEDIA_POLL_MS = 5000;

// `media` is a plain getter with no change event, so a timer asks again. The
// hook re-renders only when the answer differs, so an unchanged poll costs no
// render.
function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, MEDIA_POLL_MS);
  return () => clearInterval(timer);
}

// Read through `media` on every call, never cached at module scope, so the
// provider #18 swaps in is picked up.
const getSnapshot = (): MediaStatus => media.status();
const getServerSnapshot = (): MediaStatus => "unknown";

/** The network state shown in the tray: "unknown", "online" or "offline". */
export function useMediaStatus(): MediaStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
