"use client";

import { useMemo, useState } from "react";
import type { AppProps } from "@/os/apps/types";
import { Chip } from "@/os/ui/Chip";
import type { SkillsArgs } from "./index";
import { FOOTER_HEIGHT, TOOLBAR_HEIGHT } from "./layout";
import { ICON_RADIUS } from "./physics/constants";
import { useFullscreen } from "./screenMode";
import { SkillsStage } from "./SkillsStage";
import {
  TABS,
  practicesOf,
  skillsFor,
  viewFor,
  visibleIn,
  type SkillsView,
  type TabId,
} from "./tabs";
import "./skills.css";

// The Skills window (plan 6.3, 6.4, 6.6, D13, D23): the five category tabs, the
// floating stage of emblem buttons (SkillsStage.tsx), and the four practices as
// footer labels. #90 adds the detail panel, the list view and the clickable
// practices. This file reaches the OS through `api` only, never calls
// `useScreen()` (registry.test.ts renders every app outside a Screen), and
// never writes its own args, its title or the URL: the URL keeps what the
// window was opened with.

export default function SkillsApp({ args, api }: AppProps<SkillsArgs>) {
  // The view the window's args ask for. A re-open with other args is a new
  // object, so this is derived again and replaces what the visitor chose.
  const fromArgs = useMemo(
    () => viewFor(args, api.content),
    [args, api.content],
  );
  // The visitor's own view, with the args object it was made for. While the
  // args are still that object it wins; a different object drops it. No
  // setState runs in render for this (the pattern of ProjectsApp).
  const [own, setOwn] = useState<{
    args: SkillsArgs;
    view: SkillsView;
  } | null>(null);
  const view = own !== null && own.args === args ? own.view : fromArgs;

  // Read-only: the provider shares these arrays with every app.
  const skills = useMemo(
    () => skillsFor(view.tab, api.content),
    [view.tab, api.content],
  );
  const practices = useMemo(() => practicesOf(api.content), [api.content]);
  const radius = useFullscreen() ? ICON_RADIUS.fullscreen : ICON_RADIUS.default;

  // The selection stays if its skill is visible under the new tab (a practice
  // is visible under every tab), and clears if not.
  function choose(tab: TabId) {
    const current =
      view.selectedId === null ? undefined : api.content.skill(view.selectedId);
    const kept = current && visibleIn(current, tab) ? view.selectedId : null;
    setOwn({ args, view: { tab, selectedId: kept } });
  }

  // Selecting the selected icon keeps it selected: closing is #90's.
  function select(id: string) {
    setOwn({ args, view: { ...view, selectedId: id } });
  }

  return (
    <div className="flex h-full flex-col text-os-panel-fg">
      {/* The window title already shows the name; the heading is for the page
          outline, and registry.test.ts looks for one named after the app. */}
      <h2 className="sr-only">Skills</h2>

      <div
        style={{ height: TOOLBAR_HEIGHT }}
        className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4"
      >
        <div role="group" aria-label="Category" className="flex gap-2">
          {TABS.map((t) => (
            <Chip
              key={t.id}
              selected={view.tab === t.id}
              onClick={() => choose(t.id)}
            >
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      <SkillsStage
        skills={skills}
        selectedId={view.selectedId}
        onSelect={select}
        api={api}
        radius={radius}
      />

      <div
        style={{ height: FOOTER_HEIGHT }}
        className="flex shrink-0 items-center gap-2 border-t border-white/10 px-4"
      >
        <span className="text-xs opacity-70">Practices</span>
        {practices.map((p) => (
          <Chip key={p.id}>{p.name}</Chip>
        ))}
      </div>
    </div>
  );
}
