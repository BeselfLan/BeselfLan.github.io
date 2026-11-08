"use client";

import type { RefObject } from "react";
import type { MediaStatus } from "@/media/provider";
import { os } from "../store";
import { Menu, type MenuItem } from "../ui/Menu";
import type { AnchorRect } from "../ui/placement";
import { Popover } from "../ui/Popover";
import { power } from "./power";

// Module level, so the Popover's listener effect keeps one subscription.
const closePopover = () => os.shell.setPopover(null);

// The arrows look `power.*` up when an item is chosen, not when the list is
// built, so a test spy on an action is seen.
const POWER_ITEMS: readonly MenuItem[] = [
  { id: "settings", label: "Settings", onSelect: () => power.settings() },
  { id: "lock", label: "Lock", onSelect: () => power.lock() },
  { id: "session", separator: true },
  { id: "restart", label: "Restart", onSelect: () => power.restart() },
  { id: "power-off", label: "Power Off", onSelect: () => power.powerOff() },
];

export interface PowerMenuProps {
  open: boolean;
  /** In client px, read from the System menu button when it opened. */
  anchor: AnchorRect;
  triggerRef: RefObject<HTMLElement | null>;
  /** The media server's state, from the same hook as the tray icon. */
  status: MediaStatus;
}

/**
 * The System menu under the tray button: the media server's state as text,
 * since the tray icon is hidden from screen readers, then Settings, Lock,
 * Restart and Power Off. Open state is `shell.openPopover`.
 */
export function PowerMenu({
  open,
  anchor,
  triggerRef,
  status,
}: PowerMenuProps) {
  return (
    <Popover
      open={open}
      anchor={anchor}
      triggerRef={triggerRef}
      onClose={closePopover}
      role="dialog"
      aria-label="System menu"
      side="bottom"
      align="start"
      gap={4}
      className="w-60 py-1"
    >
      <p
        data-media-status={status}
        className="px-4 pt-2 pb-1 text-xs text-white/70"
      >
        {`Media server: ${status}`}
      </p>
      <Menu items={POWER_ITEMS} onClose={closePopover} aria-label="Power" />
    </Popover>
  );
}
