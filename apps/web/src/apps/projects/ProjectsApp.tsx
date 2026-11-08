"use client";

import type { AppProps } from "@/os/apps/types";
import type { ProjectsArgs } from "./index";

// Placeholder: #17 replaces this file with the Projects app.
export default function ProjectsApp({ args }: AppProps<ProjectsArgs>) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-os-panel-fg">
      <h2 className="text-lg font-semibold">Projects</h2>
      <p>Coming soon.</p>
      <p className="text-xs opacity-60">{JSON.stringify(args)}</p>
    </div>
  );
}
