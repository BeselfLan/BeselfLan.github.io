"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { dockApps } from "../apps/registry";
import type { AnyAppDefinition } from "../apps/types";
import { focusedWindow, isAppRunning, os, useOS } from "../store";
import type { ScreenMode } from "../store/windows";
import { Icon } from "../ui/Icon";
import { Tooltip } from "../ui/Tooltip";
import { registerIconRectGetter } from "../window/iconRect";
import { APP_GRID_ID } from "./appGrid";
import { applyDockClick, dockEntries, dockMenu } from "./dock";

// The dock is `--dock-w` (64) screen units wide on the left, or tall at the
// bottom in fullscreen mode (D4). It slides in from its own edge, as the top
// bar slides in from above. Every class below is a whole literal, because
// Tailwind reads the source text.
const SLIDE_FROM = 64;

const NAV_LEFT =
  "absolute bottom-0 left-0 top-top-bar flex w-dock flex-col items-center gap-1 bg-black/70 py-2";
const NAV_BOTTOM =
  "absolute inset-x-0 bottom-0 flex h-dock flex-row items-center justify-center gap-1 bg-black/70 px-2";

// 52 units square, with the 44 unit icon centred in it.
const BUTTON =
  "relative inline-flex size-13 items-center justify-center rounded-os-md text-white outline-offset-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-os-accent";
const BUTTON_ACTIVE =
  "relative inline-flex size-13 items-center justify-center rounded-os-md bg-white/15 text-white outline-offset-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-os-accent";

// One dot per app, in the 4 unit margin of the button, on the dock's outer edge.
const DOT_LEFT =
  "absolute left-0 top-1/2 size-1 -translate-y-1/2 rounded-full bg-os-accent";
const DOT_BOTTOM =
  "absolute bottom-0 left-1/2 size-1 -translate-x-1/2 rounded-full bg-os-accent";

// The nine dots of Show Applications, on the 24 unit grid of `Icon`.
const GRID = [5, 12, 19] as const;

function DockButton({
  app,
  mode,
}: {
  app: AnyAppDefinition;
  mode: ScreenMode;
}) {
  // Booleans, so a selector is stable and only this button re-renders.
  const running = useOS((s) => isAppRunning(s, app.id));
  const active = useOS((s) => focusedWindow(s)?.appId === app.id);
  const bottom = mode === "fullscreen";

  return (
    <Tooltip label={app.name} side={bottom ? "top" : "right"}>
      <button
        type="button"
        aria-label={app.name}
        data-dock-app={app.id}
        data-running={running ? "" : undefined}
        data-active={active ? "" : undefined}
        className={active ? BUTTON_ACTIVE : BUTTON}
        onClick={() => applyDockClick(app.id)}
        // A mouse and Shift+F10 or the Menu key both fire this, so the menu
        // opens beside its icon either way: on the edge that faces the
        // screen, in client px (plan 3.4).
        onContextMenu={(e) => {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          os.shell.openContextMenu(
            bottom ? r.left : r.right,
            r.top,
            dockMenu(useOS.getState(), app),
          );
        }}
      >
        <Icon src={app.icon} size={44} />
        {running && (
          <span aria-hidden="true" className={bottom ? DOT_BOTTOM : DOT_LEFT} />
        )}
      </button>
    </Tooltip>
  );
}

/**
 * The GNOME-style dock (plan 4.3): the pinned apps in `dock.order`, then
 * Show Applications at the end. It hands the Window layer the rect of each
 * icon, so a minimising window flies to its icon (#55).
 */
export function Dock() {
  const mode = useOS((s) => s.windows.mode);
  const reducedSetting = useOS((s) => s.settings.reducedMotion);
  const systemReduced = useReducedMotion();
  const reduced =
    reducedSetting === "on" || (reducedSetting === "system" && !!systemReduced);
  // dockEntries returns the registry's own objects, so useShallow can compare.
  const apps = useOS(useShallow((s) => dockEntries(s, dockApps)));
  const activitiesOpen = useOS((s) => s.shell.activitiesOpen);
  const navRef = useRef<HTMLElement>(null);

  // The lookup runs when a minimise starts, and reads the resting rect then.
  // Registered once: the getter reads the DOM, so it never goes stale.
  useEffect(
    () =>
      registerIconRectGetter(
        (id) =>
          navRef.current
            ?.querySelector<HTMLElement>(`[data-dock-app="${id}"]`)
            ?.getBoundingClientRect() ?? null,
      ),
    [],
  );

  const bottom = mode === "fullscreen";
  return (
    <motion.nav
      ref={navRef}
      data-dock=""
      data-dock-side={bottom ? "bottom" : "left"}
      aria-label="Dock"
      initial={
        reduced ? false : bottom ? { y: SLIDE_FROM } : { x: -SLIDE_FROM }
      }
      animate={{ x: 0, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      // The browser's own menu never shows over the dock: an icon opens the
      // dock menu, and the background opens nothing.
      onContextMenu={(e) => e.preventDefault()}
      className={bottom ? NAV_BOTTOM : NAV_LEFT}
    >
      {apps.map((app) => (
        <DockButton key={app.id} app={app} mode={mode} />
      ))}
      <div className={bottom ? "" : "mt-auto"}>
        <Tooltip label="Show Applications" side={bottom ? "top" : "right"}>
          <button
            type="button"
            aria-label="Show Applications"
            aria-expanded={activitiesOpen}
            aria-controls={APP_GRID_ID}
            className={BUTTON}
            onClick={() => os.shell.toggleActivities()}
          >
            <Icon size={28}>
              {GRID.flatMap((cy) =>
                GRID.map((cx) => (
                  <circle
                    key={`${cx}-${cy}`}
                    cx={cx}
                    cy={cy}
                    r={1.5}
                    fill="currentColor"
                    stroke="none"
                  />
                )),
              )}
            </Icon>
          </button>
        </Tooltip>
      </div>
    </motion.nav>
  );
}
