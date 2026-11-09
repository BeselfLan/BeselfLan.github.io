"use client";

import type { MediaId } from "@beself/content";
import { useEffect, useState } from "react";
import type { MediaProvider } from "@/media/provider";

// Whether Play can play (plan 5.4, D11). Both imports are type-only, so this
// file does not pull the provider binding into the chunk.

export type MediaAvailability = "checking" | "ready" | "offline";

interface Answer {
  media: MediaProvider;
  id: MediaId;
  value: "ready" | "offline";
}

/**
 * Asks `media` for `id` once per (provider, id). "checking" until it answers;
 * then "ready" when it gave the video and its status is not "offline" (an
 * "unknown" status still plays), and "offline" when it gave null, failed, or
 * the status says offline.
 *
 * The answer is stored with the provider and id it was made for and shown only
 * to that pair, so a stale answer for another entry is never shown: during the
 * render after a change the hook says "checking". `setState` runs only in a
 * promise callback, never in the effect itself.
 *
 * The call happens one microtask late and only while the effect is still live.
 * So a provider that throws, or returns something that is not a promise, gives
 * "offline" instead of crashing the panel, and Strict Mode's mount, unmount
 * and mount again resolves once.
 */
export function useMediaAvailability(
  media: MediaProvider,
  id: MediaId,
): MediaAvailability {
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => (live ? media.resolve(id) : null))
      .then((found) =>
        found && media.status() !== "offline" ? "ready" : "offline",
      )
      .catch((): "offline" => "offline")
      .then((value) => {
        if (live) setAnswer({ media, id, value });
      });
    return () => {
      live = false;
    };
  }, [media, id]);

  return answer !== null && answer.media === media && answer.id === id
    ? answer.value
    : "checking";
}
