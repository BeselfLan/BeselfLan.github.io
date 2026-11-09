import { lazy } from "react";
import { defineApp } from "@/os/apps/types";

// The Video Player definition (plan 5.5). It keeps the default export made
// with defineApp and the id "video-player", because os/apps/registry.ts
// depends on both. registry.ts imports this file into the page's first chunk,
// so it imports only react and the app contract: the component stays lazy, and
// the content package stays out. That is why the entry's title travels in the
// args: the window store re-applies title(args) on every re-open, so a title
// set later through api.setTitle would be overwritten.

/** The projects entry whose demo plays. */
export interface VideoPlayerArgs {
  /** The entry's id. The video's own id comes through the entry's `media`. */
  projectId: string;
  /**
   * The entry's title, sent by Projects' Play; the window title falls back to
   * `projectId`.
   */
  title?: string;
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
  // `||`, not `??`: an empty title falls back to the id too.
  title: (a) => `${a.title || a.projectId} -- Demo`,
});
