import { z } from "zod";
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

export function createSettingsActions(api: OSApi) {
  return {
    update(patch: Partial<Settings>): void {
      api.setState((s) => {
        Object.assign(s.settings, patch);
      });
    },
  };
}
