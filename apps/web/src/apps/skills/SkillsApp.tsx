"use client";

import { useReducedMotionConfig } from "motion/react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { AppProps } from "@/os/apps/types";
import { Button } from "@/os/ui/Button";
import { Chip } from "@/os/ui/Chip";
import type { SkillsArgs } from "./index";
import { FOOTER_HEIGHT, PANEL_WIDTH, TOOLBAR_HEIGHT } from "./layout";
import { ICON_RADIUS } from "./physics/constants";
import { useFullscreen } from "./screenMode";
import { SkillList } from "./SkillList";
import { SkillPanel } from "./SkillPanel";
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

// The Skills window (plan 6.3, 6.4, 6.5, 6.6, D13, D16, D23): the five category
// tabs, the floating stage of emblem buttons (SkillsStage.tsx) or the list view
// of the same skills (SkillList.tsx), the detail panel of the selected skill
// (SkillPanel.tsx), and the four practices as footer chips that open it.
//
// Selecting a skill, from an icon, a card or a practice chip, opens the panel;
// `selectedId` is its open state. The panel sits over the right of the stage's
// row, and the stage's loop moves its right wall in with it, so the icons are
// pushed out from behind it. In the fullscreen mode (D4) the panel covers the
// whole stage and the wall stays out: 45 icons could never settle in what is
// left of a phone's width. List view is the default under reduced motion, until
// the visitor presses the toggle; the stage, and with it the loop, is not
// rendered then, and the list's own Practices section replaces the footer.
//
// Escape closes the panel. It is heard on this component's root element, so
// only while DOM focus is inside the app, and it is prevented, so the OS's own
// Escape (which closes the App Grid, a menu or a popover) skips it. A shortcut
// from `api.registerShortcut` would follow the focused window instead of DOM
// focus, and would close the panel while the App Grid's search field has focus.
// Projects does the same (#117).
//
// When a skill opens while focus is outside the app root (a click that did not
// focus, as in Safari, a deep link, another app, or the window's own title
// bar), the panel takes focus. Escape then reaches the root, and `close()`
// returns focus to the opener. Focus already inside the app is never moved.
//
// This file reaches the OS through `api` only, never calls `useScreen()`
// (registry.test.ts renders every app outside a Screen), and never writes its
// own args, its title or the URL: the URL keeps what the window was opened
// with. It opens no other app itself; the panel does, for "Used in". It
// registers no shortcut and listens to no `window` or `document` event.

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
  const full = useFullscreen();
  const radius = full ? ICON_RADIUS.fullscreen : ICON_RADIUS.default;

  const panelId = useId();
  const labelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedId = view.selectedId;
  useEffect(() => {
    if (selectedId === null) return;
    const root = rootRef.current;
    if (!root || root.contains(document.activeElement)) return;
    root
      .querySelector<HTMLElement>("[data-skill-panel]")
      ?.focus({ preventScroll: true });
  }, [selectedId]);
  // The visitor's choice of view, or null until they press the toggle. Until
  // then the list is the default under reduced motion (6.6).
  const reduced = useReducedMotionConfig() ?? false;
  const [listChoice, setListChoice] = useState<boolean | null>(null);
  const list = listChoice ?? reduced;
  const open = view.selectedId !== null;

  // The selection stays if its skill is visible under the new tab (a practice
  // is visible under every tab), and clears if not.
  function choose(tab: TabId) {
    const current =
      view.selectedId === null ? undefined : api.content.skill(view.selectedId);
    const kept = current && visibleIn(current, tab) ? view.selectedId : null;
    setOwn({ args, view: { tab, selectedId: kept } });
  }

  // Selecting the selected icon or card keeps it selected; the X, Escape and
  // the open practice's own chip close the panel.
  function select(id: string) {
    setOwn({ args, view: { ...view, selectedId: id } });
  }

  // Closes the panel. When focus was inside it (the X, or Escape from there)
  // the panel is about to unmount, so focus goes back to whatever opened it,
  // and not to the page (plan 8.2).
  function close() {
    const root = rootRef.current;
    const id = view.selectedId;
    const inPanel =
      root
        ?.querySelector("[data-skill-panel]")
        ?.contains(document.activeElement) ?? false;
    setOwn({ args, view: { ...view, selectedId: null } });
    if (inPanel && root && id) {
      root
        .querySelector<HTMLElement>(
          `[data-skill-id="${id}"], [data-skill-card="${id}"], [data-practice="${id}"] button`,
        )
        ?.focus({ preventScroll: true });
    }
  }

  // A practice chip is a toggle: pressing the open one closes the panel.
  function pressPractice(id: string) {
    if (view.selectedId === id) close();
    else select(id);
  }

  // Escape closes the panel while focus is anywhere in the app. It is ignored
  // with nothing open, with a modifier, during text composition, and when a
  // child already took it. `preventDefault` tells the OS's listener on `window`
  // that the app used the key.
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || view.selectedId === null) return;
    if (e.defaultPrevented || e.nativeEvent.isComposing) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    close();
  }

  return (
    <div
      ref={rootRef}
      className="flex h-full flex-col text-os-panel-fg"
      onKeyDown={keys}
    >
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
        <Button
          variant="ghost"
          className="ml-auto"
          aria-pressed={list}
          onClick={() => setListChoice(!list)}
        >
          List view
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {list ? (
          <SkillList
            skills={skills}
            practices={practices}
            selectedId={view.selectedId}
            onSelect={select}
            panelId={panelId}
            reserve={open && !full ? PANEL_WIDTH : 0}
          />
        ) : (
          <SkillsStage
            skills={skills}
            selectedId={view.selectedId}
            onSelect={select}
            api={api}
            radius={radius}
            panelId={panelId}
            wall={open && !full}
          />
        )}
        {/* After the stage, so Tab reaches it after the icons. */}
        {view.selectedId !== null && (
          <SkillPanel
            id={panelId}
            skillId={view.selectedId}
            api={api}
            onClose={close}
            full={full}
          />
        )}
      </div>

      {!list && (
        <div
          role="group"
          aria-labelledby={labelId}
          style={{ height: FOOTER_HEIGHT }}
          className="flex shrink-0 items-center gap-2 border-t border-white/10 px-4"
        >
          <span id={labelId} className="text-xs opacity-70">
            Practices
          </span>
          {practices.map((p) => (
            <span key={p.id} data-practice={p.id}>
              <Chip
                selected={view.selectedId === p.id}
                onClick={() => pressPractice(p.id)}
              >
                {p.name}
              </Chip>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
