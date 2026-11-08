import { staticContent } from "../../content/static";
import { media } from "../../media/provider";
import { shortcuts } from "../input/shortcuts";
import { os, useOS } from "../store";
import { TITLE_BAR_HEIGHT } from "../window/TitleBar";
import {
  isWindowVisible,
  subscribeWindowVisible,
} from "../window/useWindowVisible";
import type { AnyAppDefinition, AppApi } from "./types";

/**
 * Binds every AppApi member to one window. Apps reach the OS only through
 * this (plan 3.4). Nothing is read at import, and the store is read when a
 * member is called, never captured.
 */
export function createAppApi(
  windowId: string,
  app: Pick<AnyAppDefinition, "window">,
): AppApi {
  return {
    close() {
      void os.windows.closeWindow(windowId);
    },
    minimize() {
      os.windows.minimizeWindow(windowId);
    },
    focus() {
      os.windows.focusWindow(windowId);
    },
    setTitle(title) {
      os.windows.setTitle(windowId, title);
    },
    openApp(appId, args) {
      return os.windows.openApp(appId, args);
    },
    notify(n) {
      os.notifications.push(n);
    },
    isVisible() {
      return isWindowVisible(windowId);
    },
    subscribeVisible(cb) {
      return subscribeWindowVisible(windowId, cb);
    },
    bounds() {
      const { items, workArea } = useOS.getState().windows;
      const win = items.find((w) => w.id === windowId);
      // A maximised window fills the work area, which is also every window in
      // fullscreen mode. Once the window is gone, the definition's size.
      const full = win?.maximized
        ? { width: workArea.w, height: workArea.h }
        : (win?.size ?? app.window);
      const bar = app.window.chrome === "none" ? 0 : TITLE_BAR_HEIGHT;
      return {
        width: Math.max(0, full.width),
        height: Math.max(0, full.height - bar),
      };
    },
    registerShortcut(s) {
      return shortcuts.register(windowId, s.combo, s.handler);
    },
    content: staticContent,
    media,
  };
}
