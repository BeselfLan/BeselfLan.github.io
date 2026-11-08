"use client";

import type { AppProps } from "@/os/apps/types";
import type { SkillsArgs } from "./index";

// Placeholder: #20 replaces this file with the Skills app.
export default function SkillsApp({ args }: AppProps<SkillsArgs>) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-os-panel-fg">
      <h2 className="text-lg font-semibold">Skills</h2>
      <p>Coming soon.</p>
      <p className="text-xs opacity-60">{JSON.stringify(args)}</p>
    </div>
  );
}
