"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { useScreen } from "../screen/Screen";
import { os } from "../store";
import { AltTab } from "./AltTab";
import { AppGrid } from "./AppGrid";
import { ContextMenuHost } from "./ContextMenuHost";
import { desktopMenu, opensDesktopMenu } from "./desktopMenu";
import { Dock } from "./Dock";
import { useFocusFollowsWindow, useFocusOrder } from "./focusOrder";
import { Notifications } from "./Notifications";
import { Signature } from "./Signature";
import { TopBar } from "./TopBar";
import { Wallpaper } from "./Wallpaper";
import { useWelcome } from "./welcome";

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
// the top bar, the dock, the toasts, the App Grid, the context menu and the
// Alt+Tab strip go after it, in that order, so the grid paints over the dock
// and the toasts, the menu over the grid, and the strip over everything. The
// toasts sit between the dock and the grid (#101).
// The root has no z-index and no `isolate`, so it adds nothing to the stacking.
// Tab does not follow this paint order: useFocusOrder walks the top bar, the
// dock, the windows by z and the toasts (plan 4.8, #102).
export function Desktop({ children }: { children: ReactNode }) {
  const { portalTarget } = useScreen();
  // Greets the first empty desktop of a session, once the boot reaches it.
  useWelcome();
  // Tab walks the top bar, the dock, the windows by z and the toasts (plan
  // 4.8), whatever the paint order of the layers below.
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusOrder(rootRef);
  // Focus goes with the window that is opened, restored or chosen (#146).
  useFocusFollowsWindow();

  // Shift+F10 and the Menu key, with nothing focused, fire `contextmenu` at
  // the body as this first assumed, or, in Chromium (#158), at the element
  // under the viewport's top-left corner, with no button. opensDesktopMenu
  // tells them from a mouse right-click, which the wallpaper's own handler has
  // already taken. The wallpaper cannot take focus, so the menu opens at the
  // middle of the screen, and its first item takes focus.
  useEffect(() => {
    const onContextMenu = (e: globalThis.MouseEvent) => {
      if (!opensDesktopMenu(e, document.activeElement)) return;
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
    <div ref={rootRef} className="absolute inset-0">
      <Wallpaper onContextMenu={openDesktopMenu} />
      <Signature />
      {children}
      <TopBar />
      <Dock />
      <Notifications />
      <AppGrid />
      <ContextMenuHost />
      <AltTab />
    </div>
  );
}
