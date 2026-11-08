"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { gridApps } from "../apps/registry";
import { os, useOS } from "../store";
import { Icon } from "../ui/Icon";
import { APP_GRID_ID, filterApps } from "./appGrid";

export type AppGridMode = "apps" | "windows";

// Launching closes the grid too, so the window that opens is not hidden.
function launch(id: string): void {
  os.windows.openApp(id);
  os.shell.setActivitiesOpen(false);
}

// A press that lands on a tile or on the search field is not a press on the
// backdrop. The gaps between the tiles are backdrop.
const isBackdrop = (target: EventTarget): boolean =>
  target instanceof Element &&
  target.closest("[data-app-grid-tile], input") === null;

// Mounted only while the grid is open, so every open starts with an empty search.
function GridBody() {
  const reducedSetting = useOS((s) => s.settings.reducedMotion);
  const systemReduced = useReducedMotion();
  const reduced =
    reducedSetting === "on" || (reducedSetting === "system" && !!systemReduced);

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = filterApps(gridApps, query);

  // Focus the search field on open, and give focus back on close. It reads the
  // active element here and not during render, and the cleanup makes Strict
  // Mode's second mount end the same way.
  useEffect(() => {
    const previous = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter that picks an IME candidate is not a launch. Esc and Super are not
    // handled here: the global shortcuts already close the grid from a field.
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const first = matches[0];
    if (first !== undefined) launch(first.id);
  };

  const onBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (isBackdrop(e.target)) os.shell.setActivitiesOpen(false);
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Applications"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      onClick={onBackdropClick}
      className="absolute inset-0 flex flex-col items-center gap-8 bg-black/55 px-8 pt-16 backdrop-blur-md"
    >
      <input
        ref={inputRef}
        type="search"
        aria-label="Search apps"
        placeholder="Type to search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-80 max-w-full rounded-os-md bg-white/10 px-3 py-2 text-white placeholder:text-white/60 focus-visible:outline-2 focus-visible:outline-os-accent"
      />
      <div className="flex flex-wrap justify-center gap-6">
        {matches.map((app) => (
          <button
            key={app.id}
            type="button"
            data-app-grid-tile={app.id}
            onClick={() => launch(app.id)}
            className="flex w-28 flex-col items-center gap-2 rounded-os-md p-2 text-sm text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-os-accent"
          >
            <Icon src={app.icon} size={72} />
            <span>{app.name}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/**
 * The App Grid (plan 4.4): a blurred overlay over everything below the top
 * bar, with a search field and one tile per app. It opens on
 * `shell.activitiesOpen`, which Activities, Show Applications and Super toggle.
 *
 * The root is always in the DOM, because Activities and Show Applications name
 * it in `aria-controls`; only its content mounts while it is open. `mode`
 * "windows" will show window thumbnails once they exist; until then it draws
 * the apps grid, as "apps" does.
 */
export function AppGrid({ mode = "apps" }: { mode?: AppGridMode }) {
  const open = useOS((s) => s.shell.activitiesOpen);
  return (
    <div
      id={APP_GRID_ID}
      data-app-grid=""
      data-mode={mode}
      hidden={!open}
      className="absolute inset-x-0 top-top-bar bottom-0"
    >
      {open && <GridBody />}
    </div>
  );
}
