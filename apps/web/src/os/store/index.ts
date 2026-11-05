import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  createNotificationActions,
  initialNotifications,
  type NotificationState,
} from "./notifications";
import {
  createSettingsActions,
  defaultSettings,
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

/**
 * Read with selectors: `useOS((s) => s.settings.wallpaper)`. A selector that
 * builds a new array or object needs `useShallow`, because zustand 5 passes it
 * straight to useSyncExternalStore.
 */
export const useOS = create<OSState>()(
  devtools(
    immer(() => initialState),
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
