"use client";

import type { ReactNode } from "react";
import { gridApps } from "../apps/registry";
import { os } from "../store";
import { Button } from "../ui/Button";
import { Signature } from "./Signature";
import { Wallpaper } from "./Wallpaper";

// The desktop surface (plan 4.1, #77). `children` is the window layer, and it
// is rendered exactly once. The layer is `isolate`, so whatever is rendered
// AFTER `children` paints above every window, and whatever is rendered before
// it paints below. So the wallpaper and the signature go before `children`;
// the top bar, dock, app grid, notifications and Alt+Tab go after it. The root
// has no z-index and no `isolate`, so it adds nothing to the stacking.
//
// The small launcher stays until #16 replaces it with the dock.
export function Desktop({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0">
      <Wallpaper />
      <Signature />
      {children}
      <nav
        aria-label="Apps"
        className="absolute top-12 right-4 flex flex-col gap-2"
      >
        {/* gridApps only: video-player throws without a projectId. No icons,
            because their files come with #16. */}
        {gridApps.map((app) => (
          <Button
            key={app.id}
            onClick={() => {
              os.windows.openApp(app.id);
            }}
          >
            {`Open ${app.name}`}
          </Button>
        ))}
      </nav>
    </div>
  );
}
