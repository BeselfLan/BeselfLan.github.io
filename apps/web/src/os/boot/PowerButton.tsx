"use client";

import { useEffect, useRef } from "react";
import { os } from "../store";

// The way back after Power Off (plan 3.5): a "Power on" button on the desk in
// front of the closed laptop. It starts a full boot, lid included. Laptop
// renders it only after a shutdown, outside the camera: a button inside a
// preserve-3d subtree is hit-tested in 3D, so its click target would depend on
// the pose. It fades in after `delayMs`, when the lid has closed.
export function PowerButton({ delayMs }: { delayMs: number }) {
  const button = useRef<HTMLButtonElement>(null);
  // The System menu item that had focus went away with the desktop.
  useEffect(() => {
    button.current?.focus();
  }, []);

  return (
    <button
      ref={button}
      type="button"
      data-power-button=""
      className="boot-laptop-power"
      style={{ animationDelay: `${delayMs}ms` }}
      // The named action, not send("powerOn"): pressing power is a full boot.
      onClick={() => os.boot.powerOn()}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="boot-laptop-power-glyph"
      >
        <path d="M12 3v9" />
        <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
      </svg>
      <span>Power on</span>
    </button>
  );
}
