"use client";

import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { useRef, useSyncExternalStore } from "react";
import { topBar } from "../apps/extensions";
import { getApp } from "../apps/registry";
import { focusedWindow, os, useOS } from "../store";
import { Button } from "../ui/Button";
import { REDUCED_MOTION } from "../window/windowMotion";
import { formatClock, useClock } from "./clock";
import { useMediaStatus } from "./mediaStatus";
import { BatteryIcon, NetworkIcon, VolumeIcon } from "./TrayIcons";

// The bar is `--top-bar-h` (32) screen units tall; it slides in from above.
const SLIDE_FROM = -32;

/**
 * The 32-unit top bar (plan 4.2): Activities and the focused app's name on the
 * left, the clock in the middle, and on the right the registered tray items
 * and one "System menu" button holding the network, volume and battery.
 *
 * The clock and the system menu only set `shell.openPopover`; the popovers
 * come with #78, which passes `clockRef` and `powerRef` as `triggerRef` and
 * reads them for the anchor. At rest the bar has no transform, so a popover
 * anchors to plain client coordinates.
 */
export function TopBar() {
  const reducedSetting = useOS((s) => s.settings.reducedMotion);
  const systemReduced = useReducedMotion();
  const reduced =
    reducedSetting === "on" || (reducedSetting === "system" && !!systemReduced);

  const activitiesOpen = useOS((s) => s.shell.activitiesOpen);
  const openPopover = useOS((s) => s.shell.openPopover);
  // A string, so the selector is stable; the window object is not.
  const appId = useOS((s) => focusedWindow(s)?.appId ?? null);
  const appName = appId === null ? undefined : getApp(appId)?.name;

  const clock = formatClock(useClock());
  const trayItems = useSyncExternalStore(
    topBar.subscribe,
    topBar.listTrayItems,
    topBar.listTrayItems,
  );
  const mediaStatus = useMediaStatus();

  const clockRef = useRef<HTMLButtonElement>(null);
  const powerRef = useRef<HTMLButtonElement>(null);

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
          onClick={() => os.shell.toggleActivities()}
        >
          Activities
        </Button>
        <span data-focused-app="" className="ml-2 font-medium">
          {appName}
        </span>

        <Button
          ref={clockRef}
          variant="ghost"
          data-clock=""
          aria-haspopup="dialog"
          aria-expanded={openPopover === "calendar"}
          className="absolute left-1/2 -translate-x-1/2"
          onClick={() =>
            os.shell.setPopover(openPopover === "calendar" ? null : "calendar")
          }
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
            aria-label="System menu"
            aria-haspopup="dialog"
            aria-expanded={openPopover === "power"}
            onClick={() =>
              os.shell.setPopover(openPopover === "power" ? null : "power")
            }
          >
            <NetworkIcon status={mediaStatus} />
            <VolumeIcon />
            <BatteryIcon />
          </Button>
        </div>
      </motion.header>
    </MotionConfig>
  );
}
