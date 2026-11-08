"use client";

import type { ReactNode } from "react";
import { gridApps } from "../apps/registry";
import { os } from "../store";
import { Button } from "../ui/Button";

// A stub with its final props (plan 2.7, #67): a plain background and a small
// launcher, for trying `/` before the real desktop exists. The desktop issues
// (#15 and #16) replace this body and remove the launcher.
//
// `children` is the window layer, and it is rendered exactly once. The layer is
// `isolate`, so whatever is rendered AFTER `children` paints above every
// window, and whatever is rendered before it paints below. So the wallpaper
// goes before `children`; the top bar, dock, app grid, notifications and
// Alt+Tab go after it. The root has no z-index and no `isolate`, so it adds
// nothing to the stacking.
export function Desktop({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 bg-os-aubergine">
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
