import { lazy } from "react";
import { defineApp } from "@/os/apps/types";

// A placeholder definition (plan 5.1). The Projects issue (#17) replaces this
// file and ProjectsApp.tsx; the args, the size and the deep link are its to
// change. It keeps the default export made with defineApp and the id, because
// os/apps/registry.ts depends on both.

/** `item` is a project entry id; `filter` is a kind or tag to start on. */
export interface ProjectsArgs {
  item?: string;
  filter?: string;
}

export default defineApp<ProjectsArgs>({
  id: "projects",
  name: "Projects",
  icon: "/icons/apps/projects.svg",
  window: { width: 1040, height: 640, resizable: false },
  capabilities: { minimize: true, maximize: false, close: true },
  singleton: true,
  dock: { pinned: true, order: 1 },
  showInAppGrid: true,
  defaultArgs: {},
  component: lazy(() => import("./ProjectsApp")),
  // `?app=projects&item=<id>` opens the app on that entry (D16).
  deepLink: {
    parse: (params) => {
      const item = params.get("item");
      return item ? { item } : {};
    },
    format: ({ item }): Record<string, string> => (item ? { item } : {}),
  },
});
