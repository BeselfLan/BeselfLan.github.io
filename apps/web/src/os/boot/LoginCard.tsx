"use client";

import { useEffect, useRef } from "react";
import { staticContent } from "@/content/static";
import { os } from "../store";

// The login stage's screen (plan 3.6): a GDM-like card with an initials tile,
// the profile name and "Click to log in". The stage shows only when
// `settings.showLogin` is on (off by default), and it has no timer, so it waits
// for a click or Enter. The name comes from the content package.

/** The first letter of each of the first two words, upper case; "?" if none. */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => Array.from(word)[0].toUpperCase());
  return letters.length > 0 ? letters.join("") : "?";
}

export function LoginCard() {
  const button = useRef<HTMLButtonElement>(null);
  // The button is the only thing to do here, so it has focus from the start.
  useEffect(() => {
    button.current?.focus();
  }, []);

  const name = staticContent.profile().name;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-os-dark">
      <button
        ref={button}
        type="button"
        data-login-card=""
        className="flex flex-col items-center gap-3 rounded-os-lg p-8 text-os-panel-fg outline-offset-4 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-os-accent"
        onClick={() => {
          // Clear the line index, so the fade at desktop-enter starts from
          // black and not from the boot log hidden behind this card.
          os.boot.setLineIndex(0);
          os.boot.advance();
        }}
      >
        <span
          aria-hidden="true"
          className="flex size-24 items-center justify-center rounded-full bg-os-aubergine font-sans text-4xl font-bold"
        >
          {initials(name)}
        </span>
        {/* A literal space between the spans, so the name reads "<name> Click
            to log in" with or without CSS. */}
        <span className="text-2xl font-medium">{name}</span>{" "}
        <span className="text-sm text-os-panel-fg/70">Click to log in</span>
      </button>
    </div>
  );
}
