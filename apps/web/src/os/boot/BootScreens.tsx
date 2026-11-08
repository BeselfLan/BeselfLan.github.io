import type { ReactNode } from "react";
import { BootLog } from "./BootLog";
import type { BootLine } from "./bootScript";
import type { BootStage } from "./stages";
import "./boot.css";

// What each boot stage shows on the screen (plan 3.2). The record is keyed by
// BootStage, so a new stage fails tsc until it has a view. A view is a plain
// function, not a component, because it is picked by stage during render.
//
// Every length comes from `durationMs`, which the caller reads from the stage
// table, so a changed table or a fast boot stays in step. Nothing here reads
// the clock or the browser: reduced motion arrives as a prop.

export interface ViewProps {
  /** The stage's duration, for the animation inside it. */
  durationMs: number;
  /** The lines printed so far. */
  lines: readonly BootLine[];
  /** Reduced motion (plan 3.4): no scanlines, and a backlight that only sits. */
  reduced: boolean;
}

const inMs = (ms: number) => ({ animationDuration: `${ms}ms` });

// Nothing over the black root: the stages with no screen of their own. #14
// gives restarting, login and shutting-down their views in the next commit,
// and #75's lid opens over lid-opening.
const black = (): ReactNode => null;

function powerOn({ durationMs, reduced }: ViewProps): ReactNode {
  // Under reduced motion the backlight is a still gradient and there are no
  // scanlines, whatever the CSS says: the flag decides, not a media query.
  if (reduced) {
    return <div aria-hidden="true" className="boot-glow absolute inset-0" />;
  }
  return (
    <>
      <div
        aria-hidden="true"
        className="boot-glow boot-glow-animated absolute inset-0"
        style={inMs(durationMs)}
      />
      <div
        aria-hidden="true"
        className="boot-scanlines absolute inset-0"
        style={inMs(durationMs)}
      />
    </>
  );
}

function firmware({ durationMs }: ViewProps): ReactNode {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex flex-col items-center justify-center gap-6"
    >
      <span className="font-sans text-5xl font-bold tracking-wide text-os-panel-fg">
        BeselfOS
      </span>
      <div className="h-1 w-64 overflow-hidden rounded-full bg-white/10">
        <div
          data-boot-progress=""
          className="boot-fill h-full w-full origin-left bg-os-orange"
          style={inMs(durationMs)}
        />
      </div>
      {/* BootSequence listens for any key or press in this stage. */}
      <p className="text-sm text-os-panel-fg/70">Press any key to skip</p>
    </div>
  );
}

const logView = ({ lines }: ViewProps): ReactNode => <BootLog lines={lines} />;

const VIEWS: Record<BootStage, (props: ViewProps) => ReactNode> = {
  off: black,
  "lid-opening": black,
  "power-on": powerOn,
  firmware,
  "boot-log": logView,
  login: black,
  // The fade is on the root, which BootSequence owns.
  "desktop-enter": logView,
  desktop: black,
  "shutting-down": black,
  restarting: black,
};

/** The screen for `stage`, drawn inside the black root. */
export function BootScreen({
  stage,
  ...props
}: ViewProps & { stage: BootStage }): ReactNode {
  return VIEWS[stage](props);
}
