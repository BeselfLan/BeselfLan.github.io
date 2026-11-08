"use client";

import type { ReactNode } from "react";
import { ContextMenuHost } from "./ContextMenuHost";
import { Dock } from "./Dock";
import { Signature } from "./Signature";
import { TopBar } from "./TopBar";
import { Wallpaper } from "./Wallpaper";

// The desktop surface (plan 4.1, #77). `children` is the window layer, and it
// is rendered exactly once. The layer is `isolate`, so whatever is rendered
// AFTER `children` paints above every window, and whatever is rendered before
// it paints below. So the wallpaper and the signature go before `children`;
// the top bar, the dock and the context menu go after it, and #100 to #102 add
// the app grid, the toasts and Alt+Tab after the dock. The root has no z-index
// and no `isolate`, so it adds nothing to the stacking.
export function Desktop({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0">
      <Wallpaper />
      <Signature />
      {children}
      <TopBar />
      <Dock />
      <ContextMenuHost />
    </div>
  );
}
