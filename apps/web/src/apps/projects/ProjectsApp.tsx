"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { AppProps } from "@/os/apps/types";
import { Chip } from "@/os/ui/Chip";
import { Carousel } from "./Carousel";
import { PANEL_SHIFT } from "./detail";
import { DetailPanel } from "./DetailPanel";
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
// the "n items" count, the selection, the entries on the 3D ring (#94, D8) and
// the detail panel of the selected entry beside it. The selection is the open
// state of the panel: it opens when an entry is selected, and the X or a plain
// Escape deselects. While it is open the ring moves right by `PANEL_SHIFT`.
// This file does not use `useScreen()`, so `registry.test.ts` can render it
// outside a Screen, and it reaches the OS through `api` only. It never writes
// its own args, its title or the URL: the URL keeps what the window was opened
// with.

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

  // Selecting the selected item keeps it selected: the panel's X and Escape
  // are what deselect.
  function select(id: string) {
    setOwn({ args, view: { ...view, selectedId: id } });
  }

  // The panel shows while the selected id is an entry. The ring's items point
  // at it with aria-controls.
  const panelId = useId();
  const openEntry =
    view.selectedId === null ? undefined : api.content.entry(view.selectedId);

  // Closing is deselecting, and focus goes back to the ring's front item, so a
  // keyboard visitor is not left on a control that has just gone. A plain
  // focus() could scroll the window's overflow-hidden content box.
  const rootEl = useRef<HTMLDivElement>(null);
  function close() {
    setOwn({ args, view: { ...view, selectedId: null } });
    rootEl.current
      ?.querySelector<HTMLElement>("[data-carousel] [data-front]")
      ?.focus({ preventScroll: true });
  }

  // Escape is heard on this root, and not through api.registerShortcut: a
  // window's shortcut would take the key before the App Grid could close
  // itself. preventDefault is what keeps the OS's Escape (close all) from
  // running, as the OS skips an event that is already prevented. Only a plain
  // Escape while the panel is open; anything else passes through untouched.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || openEntry === undefined) return;
    if (e.defaultPrevented || e.nativeEvent.isComposing) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    close();
  }

  return (
    <div
      ref={rootEl}
      onKeyDown={onKeyDown}
      className="flex h-full flex-col text-os-panel-fg"
    >
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
          it is in the new list. The panel is a sibling after the ring, never
          inside its stage, and this div has no padding, border or margin: the
          stage must keep its size (it carries the wheel and the drag). The
          panel has one place in the tree, so a new selection updates it in
          place instead of sliding it in again. */}
      <div className="relative min-h-0 flex-1">
        <Carousel
          key={`${view.filter}:${openId(args)}`}
          items={entries}
          initialFrontId={view.selectedId}
          selectedId={view.selectedId}
          onSelect={select}
          paused={!visible}
          offsetX={openEntry ? PANEL_SHIFT : 0}
          panelId={panelId}
        />
        {openEntry && (
          <DetailPanel
            id={panelId}
            entry={openEntry}
            api={api}
            onClose={close}
          />
        )}
      </div>
    </div>
  );
}
