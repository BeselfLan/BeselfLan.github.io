"use client";

import { useMemo, useState } from "react";
import type { AppProps } from "@/os/apps/types";
import { Chip } from "@/os/ui/Chip";
import {
  FILTERS,
  countLabel,
  entriesFor,
  viewFor,
  type FilterId,
  type ProjectsView,
} from "./filters";
import type { ProjectsArgs } from "./index";
import { ProjectItem } from "./ProjectItem";

// The Projects window (plan 5.2, D22): the filter chips with Featured first,
// the "n items" count, the selection, and the entries. The entries are a plain
// wrapped grid for now; #83 replaces `[data-projects-grid]` with the ring, and
// #18 adds the detail panel beside it. This file does not use `useScreen()`,
// so `registry.test.ts` can render it outside a Screen, and it reaches the OS
// through `api` only. It never writes its own args, its title or the URL: the
// URL keeps what the window was opened with.

export default function ProjectsApp({ args, api }: AppProps<ProjectsArgs>) {
  // The view the window's args ask for. A re-open with other args is a new
  // object, so this is derived again and replaces what the visitor chose.
  const fromArgs = useMemo(
    () => viewFor(args, api.content),
    [args, api.content],
  );
  // The visitor's own view, with the args object it was made for. While the
  // args are still that object it wins; a different object drops it. No
  // setState runs in render for this.
  const [own, setOwn] = useState<{
    args: ProjectsArgs;
    view: ProjectsView;
  } | null>(null);
  const view = own !== null && own.args === args ? own.view : fromArgs;

  // Read-only: the provider shares these arrays with every app.
  const entries = useMemo(
    () => entriesFor(view.filter, api.content),
    [view.filter, api.content],
  );

  // The selection stays if its entry is in the new list, and clears if not.
  function choose(filter: FilterId) {
    const kept =
      view.selectedId !== null &&
      entriesFor(filter, api.content).some((e) => e.id === view.selectedId)
        ? view.selectedId
        : null;
    setOwn({ args, view: { filter, selectedId: kept } });
  }

  // Selecting the selected item keeps it selected: deselecting is #18's (the
  // panel's X and Esc).
  function select(id: string) {
    setOwn({ args, view: { ...view, selectedId: id } });
  }

  return (
    <div className="flex h-full flex-col text-os-panel-fg">
      {/* The window title already shows the name; the heading is for the page
          outline, and registry.test.ts looks for one named after the app. */}
      <h2 className="sr-only">Projects</h2>

      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <div role="group" aria-label="Filter" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Chip
              key={f.id}
              selected={view.filter === f.id}
              onClick={() => choose(f.id)}
            >
              {f.label}
            </Chip>
          ))}
        </div>
        <span
          data-count=""
          aria-live="polite"
          className="ml-auto text-xs opacity-70"
        >
          {countLabel(entries.length)}
        </span>
      </div>

      {/* #83 puts the carousel here and #18 the detail panel. */}
      <div className="relative min-h-0 flex-1">
        {entries.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm opacity-70">
            Nothing here yet.
          </p>
        ) : (
          // A plain grid until #83 puts the entries on the ring.
          <div data-projects-grid="" className="h-full overflow-y-auto p-4">
            <div className="flex flex-wrap content-start justify-center gap-4">
              {entries.map((e) => (
                <ProjectItem
                  key={e.id}
                  entry={e}
                  selected={e.id === view.selectedId}
                  onClick={() => select(e.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
