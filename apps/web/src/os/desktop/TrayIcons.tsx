import type { MediaStatus } from "@/media/provider";
import { Icon } from "../ui/Icon";

// The static battery level of the top bar (plan 4.2). The tray button's name
// repeats it, because the number is its only visible text (WCAG 2.5.3).
export const BATTERY_PERCENT = 87;
// Inside the outline on the 24 grid: x from 4 to 17.
const BATTERY_INNER_WIDTH = 13;

/**
 * Three arcs and a dot. Offline adds a strike across them, and unknown dims
 * the whole glyph. The status is on the wrapper for tests and for #78.
 */
export function NetworkIcon({ status }: { status: MediaStatus }) {
  return (
    <span
      data-network-status={status}
      className={
        status === "unknown" ? "inline-flex opacity-50" : "inline-flex"
      }
    >
      <Icon>
        <path d="M3.51 11.01A12 12 0 0 1 20.49 11.01" />
        <path d="M6.34 13.84A8 8 0 0 1 17.66 13.84" />
        <path d="M9.17 16.67A4 4 0 0 1 14.83 16.67" />
        <circle cx="12" cy="19.5" r="0.75" />
        {status === "offline" && <path d="M3 3L21 21" />}
      </Icon>
    </span>
  );
}

/** A speaker and two waves. Static: there is no sound control. */
export function VolumeIcon() {
  return (
    <Icon>
      <path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" />
      <path d="M15 9.5a4 4 0 0 1 0 5" />
      <path d="M17.5 7a7.5 7.5 0 0 1 0 10" />
    </Icon>
  );
}

/** An outline filled to 87 percent, then the number. */
export function BatteryIcon() {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon>
        <rect x="2" y="7" width="17" height="10" rx="2" />
        <path d="M22 11v2" />
        <rect
          x="4"
          y="9"
          width={(BATTERY_INNER_WIDTH * BATTERY_PERCENT) / 100}
          height="6"
          rx="0.5"
          fill="currentColor"
          stroke="none"
        />
      </Icon>
      <span>{`${BATTERY_PERCENT}%`}</span>
    </span>
  );
}
