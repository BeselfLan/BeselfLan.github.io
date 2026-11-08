import type { ComponentType, LazyExoticComponent } from "react";
import type { ContentProvider } from "../../content/provider";
import type { MediaProvider } from "../../media/provider";
import type { Shortcut } from "../input/shortcuts";
import type { Point, WindowCloseContext } from "../store/windows";
import type { MenuItem } from "../ui/Menu";

// The app contract (plan 4.1). Type-only imports, so this file has no runtime
// code besides defineApp and the server build can import it.

/** The default `Args`: an app that takes none. */
export type NoArgs = Record<string, never>;

/** What the app component receives. */
export interface AppProps<Args> {
  windowId: string;
  /**
   * The window's args, read from the store: a re-open with new args re-renders
   * the app. The object is frozen, so do not mutate it.
   */
  args: Args;
  api: AppApi;
}

/** Everything an app may do to the OS. It is bound to one window. */
export interface AppApi {
  /** Asks the app's `onBeforeClose` first, then closes. The app unmounts after the exit fade. */
  close(): void;
  minimize(): void;
  /** Raises this window if it is open. A minimised window stays minimised. */
  focus(): void;
  setTitle(title: string): void;
  /**
   * Opens or raises another app and returns its window id. Throws, before
   * changing anything, on an unknown app id or a missing `instanceKey`.
   */
  openApp<A>(appId: string, args?: A): string;
  notify(n: { title: string; body?: string; icon?: string }): void;
  /** True while the window is open (not minimised) and the page is visible. */
  isVisible(): boolean;
  /** Calls back only when `isVisible()` changes. Returns the unsubscribe. */
  subscribeVisible(cb: (visible: boolean) => void): () => void;
  /** The content area in screen units: the window minus its title bar. */
  bounds(): { width: number; height: number };
  /** Active only while this window is focused. Returns the unregister. */
  registerShortcut(s: Shortcut): () => void;
  content: ContentProvider;
  media: MediaProvider;
}

/**
 * One app. `Args` is what `openApp` passes it. The function fields are
 * properties, as 4.1 writes them, so a list of definitions with different
 * `Args` needs `defineApp`; any `AppDefinition<X>` still fits `WindowApp`.
 */
export interface AppDefinition<Args = NoArgs> {
  /** Kebab-case and stable: 'projects'. */
  id: string;
  /** 'Projects': the dock tooltip and the title bar. */
  name: string;
  /** '/icons/apps/projects.svg' */
  icon: string;
  window: {
    /** Screen units. */
    width: number;
    height: number;
    /** Literal false in v1. [FUTURE: boolean + minSize] */
    resizable: false;
    initialPosition?: "cascade" | "center" | Point;
    /** [FUTURE] "none" is for frameless widgets: the app draws its own bar. */
    chrome?: "default" | "none";
  };
  capabilities: {
    /** True for all v1 apps. */
    minimize: boolean;
    /** False in v1 (D12); D4 forces it on mobile. */
    maximize: boolean;
    /** True. */
    close: boolean;
    /** [FUTURE] */
    alwaysOnTop?: boolean;
  };
  /** D14. Window ids are the app id for a singleton, else `${id}:${instanceKey}`. */
  singleton: boolean;
  /** Required when `singleton` is false. */
  instanceKey?: (args: Args) => string;
  /** Null means not in the dock. */
  dock: { pinned: boolean; order: number } | null;
  showInAppGrid: boolean;
  component: LazyExoticComponent<ComponentType<AppProps<Args>>>;
  defaultArgs?: Args;
  /** D16. */
  deepLink?: {
    parse(params: URLSearchParams): Args | null;
    format(args: Args): Record<string, string>;
  };
  /** A dynamic window title: 'Tetris -- Demo'. */
  title?: (args: Args) => string;
  /** [FUTURE] The top-bar app menu. */
  menu?: readonly MenuItem[];
  /** [FUTURE] App-scoped keys. */
  shortcuts?: readonly Shortcut[];
  /** [FUTURE] Return false to keep the window open, for a confirm. */
  onBeforeClose?: (ctx: WindowCloseContext) => boolean | Promise<boolean>;
}

/**
 * A definition with its `Args` erased, for the registry and `AppHost`. The
 * function fields take `Args`, so a list of definitions with different `Args`
 * does not type-check under strictFunctionTypes.
 */
export type AnyAppDefinition = AppDefinition<unknown>;

/**
 * Checks a definition against its own `Args`, then erases them. The cast is
 * the only one: each app's file is still checked, and the registry and
 * `AppHost` can then use any app without another cast.
 */
export function defineApp<A>(def: AppDefinition<A>): AnyAppDefinition {
  return def as unknown as AnyAppDefinition;
}
