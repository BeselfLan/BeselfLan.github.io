import about from "@/apps/about";
import hello from "@/apps/_template";
import projects from "@/apps/projects";
import skills from "@/apps/skills";
import videoPlayer from "@/apps/video-player";
import type { WindowChrome } from "../window/WindowLayer";
import { createRenderContent, type AppLookup } from "./AppHost";
import type { AnyAppDefinition } from "./types";
// new-app: imports

// Every app of the OS (plan 2.7). A feature agent replaces the files inside
// its own app folder and never edits this one; `npm run new-app` inserts a line
// above each marker. Every export is defined once at module level, so the
// functions WindowLayer takes keep their identity, and nothing reads `window`
// at import, so the server build can load this file. Calling
// os.windows.setAppLookup(appLookup) is the page's job (#67).
export const apps: readonly AnyAppDefinition[] = [
  projects,
  skills,
  videoPlayer,
  about,
  hello,
  // new-app: entries
];

/** Throws on a duplicate id, because the second app would be unreachable. */
export function indexById(
  list: readonly AnyAppDefinition[],
): ReadonlyMap<string, AnyAppDefinition> {
  const byId = new Map<string, AnyAppDefinition>();
  for (const app of list) {
    if (byId.has(app.id)) {
      throw new Error(`registry: two apps share the id "${app.id}"`);
    }
    byId.set(app.id, app);
  }
  return byId;
}

const byId = indexById(apps);

/**
 * The same definition object on every call, which AppHost needs: a lookup that
 * built a new object would rebuild the window's AppApi on every render.
 */
export const getApp: AppLookup = (id) => byId.get(id);

/** For os.windows.setAppLookup. Any AppDefinition fits the store's WindowApp. */
export const appLookup = getApp;

/** What a window frame needs from an app. */
export function chromeFor(def: AnyAppDefinition): WindowChrome {
  return {
    minimize: def.capabilities.minimize,
    maximize: def.capabilities.maximize,
    close: def.capabilities.close,
    chrome: def.window.chrome,
  };
}

const chromes = new Map(
  [...byId].map(([id, def]) => [id, chromeFor(def)] as const),
);

/** WindowLayer's `chromeOf`. Undefined for an unknown id: the layer then uses FALLBACK_CHROME. */
export function chromeOf(appId: string): WindowChrome | undefined {
  return chromes.get(appId);
}

/** WindowLayer's `renderContent`. */
export const renderContent = createRenderContent(getApp);

/** Apps with a dock entry, left to right. */
export const dockApps: readonly AnyAppDefinition[] = apps
  .filter((app) => app.dock !== null)
  .sort((a, b) => (a.dock?.order ?? 0) - (b.dock?.order ?? 0));

/** Apps for the App Grid. */
export const gridApps: readonly AnyAppDefinition[] = apps.filter(
  (app) => app.showInAppGrid,
);
