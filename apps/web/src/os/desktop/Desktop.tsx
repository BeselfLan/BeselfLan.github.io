"use client";

import { useEffect, type MouseEvent, type ReactNode } from "react";
import { useScreen } from "../screen/Screen";
import { os } from "../store";
import { AppGrid } from "./AppGrid";
import { ContextMenuHost } from "./ContextMenuHost";
import { desktopMenu } from "./desktopMenu";
import { Dock } from "./Dock";
import { Signature } from "./Signature";
import { TopBar } from "./TopBar";
import { Wallpaper } from "./Wallpaper";

// A right-click on the bare wallpaper (plan 4.5). The point stays in client px,
// as the pointer gave it: the host and the popover convert it (plan 3.4).
// Module level, so the wallpaper does not re-render for a new handler.
const openDesktopMenu = (e: MouseEvent<HTMLDivElement>) => {
  e.preventDefault();
  os.shell.openContextMenu(e.clientX, e.clientY, desktopMenu());
};

// The desktop surface (plan 4.1, #77). `children` is the window layer, and it
// is rendered exactly once. The layer is `isolate`, so whatever is rendered
// AFTER `children` paints above every window, and whatever is rendered before
// it paints below. So the wallpaper and the signature go before `children`;
// the top bar, the dock, the App Grid and the context menu go after it, in
// that order, so the grid paints over the dock and the menu over the grid.
// #101 puts the toasts between the dock and the grid, and #102 adds Alt+Tab.
// The root has no z-index and no `isolate`, so it adds nothing to the stacking.
export function Desktop({ children }: { children: ReactNode }) {
  const { portalTarget } = useScreen();

  // Shift+F10 and the Menu key, with nothing focused, fire `contextmenu` at
  // the body, and the wallpaper cannot take focus. So the menu opens at the
  // middle of the screen, and its first item takes focus.
  useEffect(() => {
    const onContextMenu = (e: globalThis.MouseEvent) => {
      if (e.target !== document.body || e.defaultPrevented) return;
      e.preventDefault();
      const r = portalTarget?.getBoundingClientRect();
      os.shell.openContextMenu(
        r ? r.left + r.width / 2 : 0,
        r ? r.top + r.height / 2 : 0,
        desktopMenu(),
      );
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [portalTarget]);

  return (
    <div className="absolute inset-0">
      <Wallpaper onContextMenu={openDesktopMenu} />
      <Signature />
      {children}
      <TopBar />
      <Dock />
      <AppGrid />
      <ContextMenuHost />
    </div>
  );
}
