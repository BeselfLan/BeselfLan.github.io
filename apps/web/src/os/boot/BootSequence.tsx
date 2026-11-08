"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { staticContent } from "@/content/static";
import { os, useOS } from "../store";
import { bootContext } from "../store/boot";
import { Button } from "../ui/Button";
import { newestHeader } from "./BootLog";
import { BootScreen } from "./BootScreens";
import { bootLogDuration, buildBootScript } from "./bootScript";
import { initialMode, markBooted } from "./mode";
import { useBootReducedMotion } from "./reducedMotion";
import { createScriptStore, NO_LINES } from "./scriptStore";
import { bootMachine, type BootStage } from "./stages";

// The boot (plan 3.2, 3.3). On mount it starts a boot in the mode that
// initialMode() picks and runs the stage clock; the screens come from
// BootScreens and the printed log from BootLog. What page.tsx imports stays:
// - BootSequence() takes no props and stays mounted at every stage, because it
//   runs the stage clock. It renders nothing at `desktop`.
// - showsDesktop(stage) and DesktopStage decide when the desktop is mounted,
//   so the boot can change that without editing page.tsx.
// #14 (plan 3.4 to 3.6):
// - The mount effect starts the boot in the mode initialMode() picks from
//   `?boot=`, deep links, the session flag, reduced motion and the screen.
// - Any key or press skips during `firmware` and `boot-log`, the two stages
//   where the Skip button shows. Both come from one table check, so they never
//   disagree.
// - Reaching the desktop writes the session flag, so a reload fast-boots.
// - A fast boot fades from black: it never draws the log it skipped.
// Nothing in render reads the URL, storage, the clock or `Math.random`: the
// mode is chosen and the script is built in effects, so the server HTML is the
// `off` screen.

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

/** The stages a boot begins in: start() enters the first, restart() the second. */
const isFirstStage = (stage: BootStage) =>
  stage === "lid-opening" || stage === "restarting";

export function BootSequence() {
  const stage = useOS((s) => s.boot.stage);
  const lineIndex = useOS((s) => s.boot.lineIndex);
  const durationMs = useOS((s) =>
    bootMachine.durationFor(s.boot.stage, bootContext(s)),
  );
  // The script is built in an effect, so it lives outside React state. The
  // server snapshot is the empty list, and the first client render matches it.
  const [scripts] = useState(createScriptStore);
  const script = useSyncExternalStore(
    scripts.subscribe,
    scripts.get,
    () => NO_LINES,
  );

  const reduced = useBootReducedMotion();
  // One check for the Skip button and the listeners below.
  const canSkip = bootMachine.stageForEvent("skip", stage) !== null;

  // Once on mount. The stage check keeps Strict Mode's second run harmless.
  // initialMode() reads `window.location.search`, not useSearchParams.
  useEffect(() => {
    if (useOS.getState().boot.stage === "off") os.boot.start(initialMode());
  }, []);

  // One script per boot, built where a boot begins, in every mode, so the
  // boot-log stage always has its length. It is declared before the clock, and
  // effects run in order, so bootLogMs is set before any timer reads it.
  useEffect(() => {
    if (!isFirstStage(stage)) return;
    const lines = buildBootScript(staticContent);
    scripts.set(lines);
    os.boot.setBootLogMs(bootLogDuration(lines));
  }, [stage, scripts]);

  // Any key, or a press of a mouse, pen or finger, skips. Pointer events cover
  // all three, so a tap never skips twice. Nothing is prevented, so browser
  // shortcuts keep working; the page is fixed and has nothing to scroll.
  useEffect(() => {
    if (!canSkip) return;
    const skip = () => os.boot.skip();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [canSkip]);

  // Every kind of boot marks the session, so a reload in this tab fast-boots.
  useEffect(() => {
    if (stage === "desktop") markBooted();
  }, [stage]);

  // advance() moves one stage and sets no timer, so each stage sets the next.
  // The stage never waits on the line timers below.
  useEffect(() => {
    const ms = bootMachine.durationFor(stage, bootContext(useOS.getState()));
    if (ms === null) return;
    const timer = setTimeout(() => {
      // The last line's timer is due at this instant: draw it before leaving.
      // A boot-log that lasts 0 ms is a fast boot, which fades from black.
      if (stage === "boot-log" && ms > 0) {
        os.boot.setLineIndex(scripts.get().length);
      }
      os.boot.advance();
    }, ms);
    return () => clearTimeout(timer);
  }, [stage, scripts]);

  // One timer per line at its cumulative time, so they do not drift. They end
  // with the stage, so a skip stops the log where it is.
  useEffect(() => {
    if (stage !== "boot-log") return;
    let at = 0;
    const timers = scripts.get().map((line, i) => {
      at += line.delayMs;
      return setTimeout(() => {
        // Only forward, and only in boot-log: the last line shares its instant
        // with the stage timer, and the order of the two must not matter.
        const { boot } = useOS.getState();
        if (boot.stage === "boot-log" && boot.lineIndex < i + 1) {
          os.boot.setLineIndex(i + 1);
        }
      }, at);
    });
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [stage, scripts]);

  if (stage === "desktop") return null;

  const printed = script.slice(0, lineIndex);
  const leaving = stage === "desktop-enter";
  return (
    <div
      data-boot-stage={stage}
      className={
        leaving
          ? "boot-fade-out absolute inset-0 bg-black"
          : "absolute inset-0 bg-black"
      }
      // Inline, so the stage table sets the length and a jsdom test, which has
      // no CSS, can read both. A fading root must let the pointer through to
      // the desktop beneath it.
      style={
        leaving
          ? { pointerEvents: "none", animationDuration: `${durationMs}ms` }
          : undefined
      }
    >
      <BootScreen
        stage={stage}
        durationMs={durationMs ?? 0}
        lines={printed}
        reduced={reduced}
      />
      {/* The log is aria-hidden. This one polite region repeats the newest
          header, and it exists from the first render, because a live region
          must be in the page before its text changes. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {newestHeader(printed)}
      </p>
      {canSkip && (
        <Button
          className="absolute right-6 bottom-6"
          onClick={() => os.boot.skip()}
        >
          Skip
        </Button>
      )}
    </div>
  );
}
