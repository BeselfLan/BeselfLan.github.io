"use client";

import type { AppProps, NoArgs } from "@/os/apps/types";

// Placeholder: #21 replaces this file with the About app.
export default function AboutApp({ args }: AppProps<NoArgs>) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-os-panel-fg">
      <h2 className="text-lg font-semibold">About</h2>
      <p>Coming soon.</p>
      <p className="text-xs opacity-60">{JSON.stringify(args)}</p>
    </div>
  );
}
