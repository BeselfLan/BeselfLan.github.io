import { STATUS_LABEL } from "./bootScript";

// The screen at Power Off and at Restart (plan 3.5): three lines in systemd and
// kernel wording, printed top-left like a fresh console, then the stage ends.
// The first two lines are the same for both; the last says which it is.
//
// Line `i` shows at i/3 of the stage, as a CSS animation delay, so there is no
// timer here and the stage table sets the pace. `/home/beself` is OS flavour,
// like "BeselfOS" on the firmware screen, not a profile field.

export type ShutdownStage = "shutting-down" | "restarting";

interface ShutdownLine {
  ok: boolean;
  text: string;
}

const STOPPING: readonly ShutdownLine[] = [
  { ok: true, text: "Stopped apps" },
  { ok: true, text: "Unmounted /home/beself" },
];

export const SHUTDOWN_LINES: Record<ShutdownStage, readonly ShutdownLine[]> = {
  "shutting-down": [...STOPPING, { ok: false, text: "reboot: Power down" }],
  restarting: [...STOPPING, { ok: false, text: "reboot: Restarting system" }],
};

export function ShutdownLog({
  stage,
  durationMs,
}: {
  stage: ShutdownStage;
  durationMs: number;
}) {
  const lines = SHUTDOWN_LINES[stage];
  return (
    <div
      data-shutdown-log=""
      aria-hidden="true"
      className="absolute inset-0 flex flex-col p-6 font-mono text-base leading-5 whitespace-pre-wrap text-os-panel-fg"
    >
      {lines.map((line, i) => (
        <div
          key={i}
          data-shutdown-line=""
          className="boot-line-in"
          style={{
            animationDelay: `${Math.round((i * durationMs) / lines.length)}ms`,
          }}
        >
          {line.ok ? (
            <>
              [<span className="text-green-400">{STATUS_LABEL.ok}</span>]{" "}
              {line.text}
            </>
          ) : (
            line.text
          )}
        </div>
      ))}
    </div>
  );
}
