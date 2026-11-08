import { lazy } from "react";
import { defineApp, type NoArgs } from "@/os/apps/types";

// A placeholder definition (the note on #10). The About issue (#21) replaces
// this file and AboutApp.tsx. It keeps the default export made with defineApp
// and the id, because os/apps/registry.ts depends on both.

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
