import { lazy } from "react";
import { defineApp, type NoArgs } from "@/os/apps/types";

// The About app's definition. Its values are pinned by the lead's
// registry.test.ts and deepLink.test.ts: the name, the 760 x 600 window, the
// dock slot 3, the App Grid, a singleton, the icon path and a deep link with
// no params. os/apps/registry.ts needs the default export made with defineApp
// and the id "about", so keep both.

export default defineApp<NoArgs>({
  id: "about",
  name: "About",
  icon: "/icons/apps/about.svg",
  window: { width: 760, height: 600, resizable: false },
  capabilities: { minimize: true, maximize: false, close: true },
  singleton: true,
  dock: { pinned: true, order: 3 },
  showInAppGrid: true,
  defaultArgs: {},
  component: lazy(() => import("./AboutApp")),
  // No params: `?app=about` opens the app (D16).
  deepLink: { parse: () => ({}), format: () => ({}) },
});
