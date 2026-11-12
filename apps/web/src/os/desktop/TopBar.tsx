"use client";

import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { useRef, useState, useSyncExternalStore } from "react";
import { topBar } from "../apps/extensions";
import { getApp } from "../apps/registry";
import { focusedWindow, os, useOS } from "../store";
import { Button } from "../ui/Button";
import type { AnchorRect } from "../ui/placement";
import { REDUCED_MOTION } from "../window/windowMotion";
import { APP_GRID_ID } from "./appGrid";
import { CalendarPopover } from "./CalendarPopover";
import { formatClock, useClock } from "./clock";
import { useMediaStatus } from "./mediaStatus";
import { PowerMenu } from "./PowerMenu";
import {
  BATTERY_PERCENT,
  BatteryIcon,
  NetworkIcon,
  VolumeIcon,
} from "./TrayIcons";

// The bar is `--top-bar-h` (32) screen units tall; it slides in from above.
const SLIDE_FROM = -32;

// Before the first click. Every open goes through a click that sets the anchor.
const NO_ANCHOR: AnchorRect = { left: 0, top: 0, width: 0, height: 0 };

// Client px, read from the button that was pressed.
function anchorOf(el: HTMLElement): AnchorRect {
  const { left, top, width, height } = el.getBoundingClientRect();
  return { left, top, width, height };
}

/**
 * The 32-unit top bar (plan 4.2): Activities and the focused app's name on the
 * left, the clock in the middle, and on the right the registered tray items
 * and one "System menu" button holding the network, volume and battery.
 *
 * The clock and the system menu set `shell.openPopover`, and the popovers
 * render here, after the header: each gets its button as `triggerRef`, so the
 * button's own press toggles it, and the button's rect as the anchor. At rest
 * the bar has no transform, so an anchor is plain client coordinates.
 */
export function TopBar() {
  const reducedSetting = useOS((s) => s.settings.reducedMotion);
  const systemReduced = useReducedMotion();
  const reduced =
    reducedSetting === "on" || (reducedSetting === "system" && !!systemReduced);

  const activitiesOpen = useOS((s) => s.shell.activitiesOpen);
  // From the store and not `useScreenMode()`, which needs matchMedia.
  const mode = useOS((s) => s.windows.mode);
  const openPopover = useOS((s) => s.shell.openPopover);
  // A string, so the selector is stable; the window object is not.
  const appId = useOS((s) => focusedWindow(s)?.appId ?? null);
  const appName = appId === null ? undefined : getApp(appId)?.name;

  const now = useClock();
  const clock = formatClock(now);
  const trayItems = useSyncExternalStore(
    topBar.subscribe,
    topBar.listTrayItems,
    topBar.listTrayItems,
  );
  const mediaStatus = useMediaStatus();

  const clockRef = useRef<HTMLButtonElement>(null);
  const powerRef = useRef<HTMLButtonElement>(null);
  // One anchor per popover, so switching from one to the other cannot move it.
  const [calendarAnchor, setCalendarAnchor] = useState(NO_ANCHOR);
  const [powerAnchor, setPowerAnchor] = useState(NO_ANCHOR);

  return (
    <MotionConfig reducedMotion={REDUCED_MOTION[reducedSetting]}>
      <motion.header
        data-topbar=""
        initial={reduced ? false : { y: SLIDE_FROM }}
        animate={{ y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="absolute inset-x-0 top-0 flex h-top-bar items-center bg-black/90 px-2 text-sm text-white"
      >
        <Button
          variant="ghost"
          aria-expanded={activitiesOpen}
          aria-controls={APP_GRID_ID}
          onClick={() => os.shell.toggleActivities()}
        >
          Activities
        </Button>
        {/* Fullscreen maximises every window and its title bar names the app,
            and the name would run under the clock on a narrow screen. */}
        {mode === "laptop" && (
          <span data-focused-app="" className="ml-2 font-medium">
            {appName}
          </span>
        )}

        <Button
          ref={clockRef}
          variant="ghost"
          data-clock=""
          aria-haspopup="dialog"
          aria-expanded={openPopover === "calendar"}
          className="absolute left-1/2 -translate-x-1/2"
          onClick={(e) => {
            if (openPopover !== "calendar")
              setCalendarAnchor(anchorOf(e.currentTarget));
            os.shell.setPopover(openPopover === "calendar" ? null : "calendar");
          }}
        >
          {/* The space is not drawn in a flex row; it keeps the name readable. */}
          <span>{clock.date}</span> <span>{clock.time}</span>
        </Button>

        <div className="ml-auto flex items-center gap-1">
          {trayItems.map((item) => (
            <span key={item.id} data-tray-item={item.id}>
              {item.render()}
            </span>
          ))}
          <Button
            ref={powerRef}
            variant="ghost"
            // The visible text, "87%", must be part of the name (axe's
            // label-content-name-mismatch, WCAG 2.5.3): a visitor who says what
            // they see can then press it. The name still starts with the menu's.
            aria-label={`System menu, battery ${BATTERY_PERCENT}%`}
            aria-haspopup="dialog"
            aria-expanded={openPopover === "power"}
            onClick={(e) => {
              if (openPopover !== "power")
                setPowerAnchor(anchorOf(e.currentTarget));
              os.shell.setPopover(openPopover === "power" ? null : "power");
            }}
          >
            <NetworkIcon status={mediaStatus} />
            <VolumeIcon />
            <BatteryIcon />
          </Button>
        </div>
      </motion.header>
      <CalendarPopover
        open={openPopover === "calendar"}
        anchor={calendarAnchor}
        triggerRef={clockRef}
        today={now}
      />
      <PowerMenu
        open={openPopover === "power"}
        anchor={powerAnchor}
        triggerRef={powerRef}
        status={mediaStatus}
      />
    </MotionConfig>
  );
}
