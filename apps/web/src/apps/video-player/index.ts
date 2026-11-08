import { lazy } from "react";
import { defineApp } from "@/os/apps/types";

// A placeholder definition (plan 5.5). The video player issue (#18) replaces
// this file and VideoPlayerApp.tsx. It keeps the default export made with
// defineApp and the id, because os/apps/registry.ts depends on both.

/** The projects entry whose demo plays. */
export interface VideoPlayerArgs {
  projectId: string;
}

export default defineApp<VideoPlayerArgs>({
  id: "video-player",
  name: "Video Player",
  icon: "/icons/apps/video-player.svg",
  window: { width: 880, height: 540, resizable: false },
  capabilities: { minimize: true, maximize: false, close: true },
  // One window per project (D14): the id is `video-player:<projectId>`.
  singleton: false,
  instanceKey: (a) => a.projectId,
  // Only Play in Projects opens it, so it has no dock icon, no App Grid entry
  // and no default args: openApp("video-player") without a projectId throws.
  dock: null,
  showInAppGrid: false,
  component: lazy(() => import("./VideoPlayerApp")),
  // #18 swaps in the entry's title.
  title: (a) => `${a.projectId} -- Demo`,
});
