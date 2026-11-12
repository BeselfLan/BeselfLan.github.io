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
 *
 * It sits on a dark scrim, for contrast: this corner is the brightest part of
 * the default wallpaper, an orange, and white text at 60 percent on it is about
 * 2:1. With the scrim the tagline is 5:1 and the name 7.7:1. axe cannot measure
 * text over an image or a gradient, so Signature.test.tsx does the maths.
 */
export function Signature() {
  const mode = useOS((s) => s.windows.mode);
  const { name, tagline } = staticContent.profile();
  return (
    <div
      data-signature=""
      className="pointer-events-none absolute right-6 max-w-[420px] rounded-os-md bg-black/55 px-3 py-2 text-right"
      style={{ bottom: BOTTOM[mode] }}
    >
      <p className="text-[22px] font-medium text-white/80">{name}</p>
      <p className="text-sm text-white/60">{tagline}</p>
    </div>
  );
}
