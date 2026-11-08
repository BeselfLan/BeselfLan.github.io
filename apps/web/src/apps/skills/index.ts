import { lazy } from "react";
import { defineApp } from "@/os/apps/types";

// A placeholder definition (plan 6.1). The Skills issue (#20) replaces this
// file and SkillsApp.tsx; the args, the size and the deep link are its to
// change. It keeps the default export made with defineApp and the id, because
// os/apps/registry.ts depends on both.

/** `item` is a skill id; `tab` picks the view to start on. */
export interface SkillsArgs {
  item?: string;
  tab?: string;
}

export default defineApp<SkillsArgs>({
  id: "skills",
  name: "Skills",
  icon: "/icons/apps/skills.svg",
  window: { width: 1000, height: 620, resizable: false },
  capabilities: { minimize: true, maximize: false, close: true },
  singleton: true,
  dock: { pinned: true, order: 2 },
  showInAppGrid: true,
  defaultArgs: {},
  component: lazy(() => import("./SkillsApp")),
  // `?app=skills&item=<id>` opens the app on that skill (D16).
  deepLink: {
    parse: (params) => {
      const item = params.get("item");
      return item ? { item } : {};
    },
    format: ({ item }): Record<string, string> => (item ? { item } : {}),
  },
});
