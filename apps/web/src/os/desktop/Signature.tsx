"use client";

import { staticContent } from "@/content/static";
import { useOS } from "../store";

// Screen units. 24 px clears the laptop edge; in fullscreen the 64 px bottom
// dock (#16) sits under the signature, so it rises to 88.
const BOTTOM = { laptop: 24, fullscreen: 88 } as const;

/**
 * The owner's name and tagline in the bottom right, from the content package
 * and nowhere else (D18). It is real text, and it takes no pointer events so
 * the desktop's right-click works over it.
 */
export function Signature() {
  const mode = useOS((s) => s.windows.mode);
  const { name, tagline } = staticContent.profile();
  return (
    <div
      data-signature=""
      className="pointer-events-none absolute right-6 max-w-[420px] text-right"
      style={{ bottom: BOTTOM[mode] }}
    >
      <p className="text-[22px] font-medium text-white/80">{name}</p>
      <p className="text-sm text-white/60">{tagline}</p>
    </div>
  );
}
