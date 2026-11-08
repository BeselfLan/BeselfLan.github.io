"use client";

import { useEffect, type ReactNode } from "react";
import { os, useOS } from "../store";
import { bootContext } from "../store/boot";
import { bootMachine, type BootStage } from "./stages";

// A stub with its final props (plan 2.7, #67). It runs a skip boot straight to
// the desktop so `/` is usable before the real sequence exists. The boot child
// (#13) replaces the bodies of BootSequence, and #14 adds `?boot=`, the session
// flag and fast boot for deep links. What page.tsx imports stays:
// - BootSequence() takes no props and stays mounted at every stage, because it
//   runs the stage clock. It renders nothing at `desktop`.
// - showsDesktop(stage) and DesktopStage decide when the desktop is mounted,
//   so the boot child can change that without editing page.tsx.
// This file reads no URL and no storage.

/** True while the desktop is mounted: the stages where it shows or is leaving. */
export function showsDesktop(stage: BootStage): boolean {
  return (
    stage === "desktop-enter" ||
    stage === "desktop" ||
    stage === "shutting-down"
  );
}

/** Renders `children` only while the desktop shows. */
export function DesktopStage({ children }: { children: ReactNode }) {
  const show = useOS((s) => showsDesktop(s.boot.stage));
  return show ? children : null;
}

export function BootSequence() {
  const stage = useOS((s) => s.boot.stage);

  // Once on mount. The stage check keeps Strict Mode's second run harmless.
  useEffect(() => {
    if (useOS.getState().boot.stage === "off") os.boot.start("skip");
  }, []);

  // advance() moves one stage and sets no timer, so each stage sets the next.
  useEffect(() => {
    const ms = bootMachine.durationFor(stage, bootContext(useOS.getState()));
    if (ms === null) return;
    const timer = setTimeout(() => os.boot.advance(), ms);
    return () => clearTimeout(timer);
  }, [stage]);

  if (stage === "desktop") return null;
  return (
    <div
      data-boot-stage={stage}
      aria-hidden="true"
      className="absolute inset-0 bg-black"
    />
  );
}
