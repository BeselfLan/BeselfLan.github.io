"use client";

import type { AppProps } from "@/os/apps/types";
import type { VideoPlayerArgs } from "./index";

// Placeholder: #18 replaces this file with the video player.
export default function VideoPlayerApp({ args }: AppProps<VideoPlayerArgs>) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-os-panel-fg">
      <h2 className="text-lg font-semibold">Video Player</h2>
      <p>Coming soon.</p>
      <p className="text-xs opacity-60">{JSON.stringify(args)}</p>
    </div>
  );
}
