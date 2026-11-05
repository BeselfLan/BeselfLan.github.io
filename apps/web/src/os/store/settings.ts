import { z } from "zod";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import type { OSApi } from "./index";

// Every field has .catch(default): a missing key and an invalid value both
// fall back per field, and unknown keys are stripped.
export const SettingsSchema = z.object({
  reducedMotion: z.enum(["system", "on", "off"]).catch("system"),
  bootMode: z.enum(["full", "fast"]).catch("full"),
  wallpaper: z.enum(["aubergine", "orange", "mono"]).catch("aubergine"),
  showLogin: z.boolean().catch(false),
  sound: z.boolean().catch(false),
  theme: z.enum(["dark"]).catch("dark"),
  persistLayout: z.boolean().catch(false),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const defaultSettings: Settings = SettingsSchema.parse({});

export const SETTINGS_KEY = "beselfos:settings";
const STORAGE_VERSION = 0;

/** Per-field fallback; unknown keys are dropped; non-objects give defaults. */
export function parseSettings(raw: unknown): Settings {
  const result = SettingsSchema.safeParse(raw);
  return result.success ? result.data : defaultSettings;
}

export type PersistedSettings = { settings: Settings };

/**
 * Storage for zustand `persist`, guarded against three stock behaviours:
 * - it always exists, so persist never warns per `set` when `window` is absent;
 * - it writes nothing until `arm` is called after hydration, so an early
 *   action cannot overwrite stored settings with defaults;
 * - it skips a write when the serialised value is unchanged, so unrelated
 *   `set` calls (a window drag) never touch localStorage.
 * All storage errors are swallowed.
 */
export function createSettingsStorage(): {
  storage: PersistStorage<PersistedSettings>;
  arm: (settings: Settings) => void;
} {
  let armed = false;
  let last: string | null = null;
  const serialise = (settings: Settings): string =>
    JSON.stringify({ state: { settings }, version: STORAGE_VERSION });

  const storage: PersistStorage<PersistedSettings> = {
    getItem(name) {
      try {
        const raw = window.localStorage.getItem(name);
        if (raw === null) return null;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return null;
        return parsed as StorageValue<PersistedSettings>;
      } catch {
        return null;
      }
    },
    setItem(name, value) {
      if (!armed) return;
      const text = JSON.stringify(value);
      if (text === last) return;
      // Recorded before writing, so a full disk is not retried on every set.
      last = text;
      try {
        window.localStorage.setItem(name, text);
      } catch {
        // Storage unavailable or full: settings stay in memory only.
      }
    },
    removeItem(name) {
      try {
        window.localStorage.removeItem(name);
      } catch {
        // Nothing to remove from.
      }
    },
  };

  return {
    storage,
    arm(settings) {
      armed = true;
      last = serialise(settings);
    },
  };
}

export function createSettingsActions(api: OSApi) {
  return {
    update(patch: Partial<Settings>): void {
      api.setState((s) => {
        Object.assign(s.settings, patch);
      });
    },
  };
}
