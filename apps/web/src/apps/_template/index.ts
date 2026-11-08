import { lazy } from "react";
import { defineApp } from "@/os/apps/types";

// The example app (plan 2.4): `npm run new-app <id>` copies this folder. Keep
// it plain. The script swaps the identifier `TemplateApp` and the two quoted
// literals "hello" (the id) and "Hello" (the name), nothing else, so those
// literals appear only where the id and the name are written.
const ID = "hello";

/** What `openApp("hello", args)` passes the component. */
export interface TemplateArgs {
  name?: string;
}

export default defineApp<TemplateArgs>({
  id: ID,
  name: "Hello",
  // The icon file is drawn per app (#16). Nothing renders it yet.
  icon: `/icons/apps/${ID}.svg`,
  // Screen units. No initialPosition: windows cascade from the top left.
  window: { width: 480, height: 360, resizable: false },
  capabilities: { minimize: true, maximize: false, close: true },
  // One window for the app. A multi-instance app sets `singleton: false` and
  // an `instanceKey` (see video-player).
  singleton: true,
  // Not in the dock. It shows in the App Grid only.
  dock: null,
  showInAppGrid: true,
  defaultArgs: {},
  // Loaded on first open, behind a skeleton (AppHost).
  component: lazy(() => import("./TemplateApp")),
  // `?app=hello&name=Ann` opens the app with { name: "Ann" } (D16). `parse`
  // reads the URL, `format` writes it back when this window is focused.
  deepLink: {
    parse: (params) => {
      const name = params.get("name");
      return name ? { name } : {};
    },
    format: ({ name }): Record<string, string> => (name ? { name } : {}),
  },
});
