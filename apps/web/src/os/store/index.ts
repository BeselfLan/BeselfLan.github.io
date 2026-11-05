import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  createNotificationActions,
  initialNotifications,
  type NotificationState,
} from "./notifications";
import {
  createSettingsActions,
  defaultSettings,
  createSettingsStorage,
  parseSettings,
  SETTINGS_KEY,
  type Settings,
} from "./settings";
import { createShellActions, initialShell, type ShellState } from "./shell";

// A new slice is one new file plus one line in each of three lists:
// OSState, initialState and os.
export interface OSState {
  settings: Settings;
  shell: ShellState;
  notifications: NotificationState;
}

const initialState: OSState = {
  settings: defaultSettings,
  shell: initialShell,
  notifications: initialNotifications,
};

const { storage, arm } = createSettingsStorage();

/**
 * Read with selectors: `useOS((s) => s.settings.wallpaper)`. A selector that
 * builds a new array or object needs `useShallow`, because zustand 5 passes it
 * straight to useSyncExternalStore.
 */
export const useOS = create<OSState>()(
  devtools(
    persist(
      immer(() => initialState),
      {
        name: SETTINGS_KEY,
        storage,
        // Nothing reads storage at import, so server and first client render
        // agree. #32 calls rehydrateSettings() in a layout effect.
        skipHydration: true,
        partialize: (s) => ({ settings: s.settings }),
        merge: (persisted, current) =>
          persisted
            ? {
                ...current,
                settings: parseSettings(
                  typeof persisted === "object" && "settings" in persisted
                    ? persisted.settings
                    : undefined,
                ),
              }
            : current,
        // Writes stay off until hydration finishes, then the last-written
        // value is primed so unrelated updates write nothing.
        onRehydrateStorage: () => (state) =>
          arm((state ?? useOS.getState()).settings),
      },
    ),
    { name: "BeselfOS", enabled: process.env.NODE_ENV !== "production" },
  ),
);

export type OSApi = Pick<typeof useOS, "getState" | "setState">;

/** Plain-function actions: no React, no `this`. */
export const os = {
  settings: createSettingsActions(useOS),
  shell: createShellActions(useOS),
  notifications: createNotificationActions(useOS),
};

/** Loads stored settings into the store. Call once on the client, after mount. */
export function rehydrateSettings(): void {
  void useOS.persist.rehydrate();
}
