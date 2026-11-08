"use client";

import { useOS } from "../store";

/**
 * The wallpaper chosen by `settings.wallpaper`. The id is also the file name
 * under `public/wallpapers`, so cycling the setting needs no table. The URL
 * goes in an inline style because a Tailwind arbitrary-value class built from
 * a variable would never be generated. (Do not write that class out in a
 * comment either: Tailwind reads comments, and the build fails on it.) The
 * wallpaper sits inside the screen, never on body.
 */
export function Wallpaper() {
  const id = useOS((s) => s.settings.wallpaper);
  return (
    <div
      data-wallpaper={id}
      aria-hidden="true"
      className="absolute inset-0 bg-cover bg-center"
      style={{ backgroundImage: `url("/wallpapers/${id}.svg")` }}
    />
  );
}
