"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppProps } from "@/os/apps/types";
import { Chip } from "@/os/ui/Chip";
import { Carousel } from "./Carousel";
import {
  FILTERS,
  countLabel,
  entriesFor,
  viewFor,
  type FilterId,
  type ProjectsView,
} from "./filters";
import type { ProjectsArgs } from "./index";

// The Projects window (plan 5.2, D22): the filter chips with Featured first,
// the "n items" count, the selection, and the entries on the 3D ring (#94, D8).
// #18 adds the detail panel beside it and sets the carousel's `offsetX`. This
// file does not use `useScreen()`, so `registry.test.ts` can render it outside
// a Screen, and it reaches the OS through `api` only. It never writes its own
// args, its title or the URL: the URL keeps what the window was opened with.

// A number for each args object, given the first time the object is seen. The
// ring is keyed by it, so a new open (a new args object, which `own.args ===
// args` below also treats as new) rebuilds the ring. Idempotent per object: the
// same args always give the same number, so a render that runs twice (Strict
// Mode) agrees. It is a plain function outside the component, so its counter
// is not a component variable written in render.
const openIds = new WeakMap<object, number>();
let lastOpenId = 0;
function openId(args: object): number {
  let id = openIds.get(args);
  if (id === undefined) {
    id = ++lastOpenId;
    openIds.set(args, id);
  }
  return id;
}

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

  // The ring stops its frames while the window is hidden (D13).
  const [visible, setVisible] = useState(() => api.isVisible());
  useEffect(() => api.subscribeVisible(setVisible), [api]);

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

      {/* The ring draws "Nothing here yet." itself. A filter change or new
          args rebuild it with no animation, because its size and its angle
          change with the item count; the selected entry stays in front when
          it is in the new list. #18 puts the detail panel beside it. */}
      <div className="relative min-h-0 flex-1">
        <Carousel
          key={`${view.filter}:${openId(args)}`}
          items={entries}
          initialFrontId={view.selectedId}
          selectedId={view.selectedId}
          onSelect={select}
          paused={!visible}
          offsetX={0}
        />
      </div>
    </div>
  );
}
