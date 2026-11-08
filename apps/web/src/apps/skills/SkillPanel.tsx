"use client";

import { useReducedMotionConfig } from "motion/react";
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import type { AppApi } from "@/os/apps/types";
import { Button } from "@/os/ui/Button";
import { Chip } from "@/os/ui/Chip";
import { Icon } from "@/os/ui/Icon";
import { PANEL_MS, PANEL_WIDTH } from "./layout";
import { SkillIcon } from "./SkillIcon";
import { CATEGORY_LABEL } from "./tabs";

// The skill's detail panel (plan 6.5, D16, D23): the emblem, the name and the
// category, what the skill is, how it was used, and a chip for each entry that
// uses it, which opens that entry in Projects. Every word comes from the
// content package.
//
// It exists only while a skill is selected, so closing unmounts it. It slides
// in with a CSS keyframe animation on mount (skills.css), which needs no state
// and no effect, and the stage's wall slides with it (stageLoop.ts). Under
// reduced motion it arrives at once. The panel has no key handling of its own:
// Escape closes it from SkillsApp's root element, which hears the key only
// while DOM focus is inside the app. It uses neither `useScreen()` nor the
// Tooltip: both throw outside a Screen, where registry.test.ts renders every
// app.

export interface SkillPanelProps {
  /** The id that the opener's `aria-controls` names. */
  id: string;
  skillId: string;
  api: Pick<AppApi, "content" | "openApp">;
  onClose(): void;
  /** The fullscreen mode (D4): the panel covers the whole stage. */
  full?: boolean;
}

export function SkillPanel({
  id,
  skillId,
  api,
  onClose,
  full = false,
}: SkillPanelProps) {
  const skill = useMemo(
    () => api.content.skillsWithUsage().find((s) => s.id === skillId),
    [api.content, skillId],
  );
  const reduced = useReducedMotionConfig() ?? false;
  const headingId = useId();
  const asideRef = useRef<HTMLElement>(null);

  // A new skill starts at the top of the text.
  useLayoutEffect(() => {
    if (asideRef.current) asideRef.current.scrollTop = 0;
  }, [skillId]);

  if (!skill) return null;

  return (
    <aside
      ref={asideRef}
      id={id}
      data-skill-panel=""
      aria-labelledby={headingId}
      className={reduced ? "skills-panel" : "skills-panel skills-panel-enter"}
      style={
        {
          width: full ? "100%" : PANEL_WIDTH,
          "--skills-panel-ms": `${PANEL_MS}ms`,
        } as CSSProperties
      }
    >
      <div className="flex items-start gap-3 p-4">
        <SkillIcon skill={skill} size={72} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          <h3 id={headingId} className="text-lg font-semibold">
            {skill.name}
          </h3>
          <Chip>{CATEGORY_LABEL[skill.category]}</Chip>
        </div>
        <Button variant="ghost" aria-label="Close panel" onClick={onClose}>
          <Icon size={16}>
            <path d="M6 6l12 12M18 6 6 18" />
          </Icon>
        </Button>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-4 text-sm">
        <section className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold uppercase opacity-70">
            What it is
          </h4>
          <p>{skill.description}</p>
        </section>
        <section className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold uppercase opacity-70">
            {"How I've used it"}
          </h4>
          <p>{skill.howIUsedIt}</p>
        </section>
        {skill.usedIn.length > 0 && (
          <section className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold uppercase opacity-70">
              Used in
            </h4>
            <ul className="flex flex-wrap gap-2">
              {skill.usedIn.map((entry) => (
                <li key={entry.id}>
                  <Chip
                    onClick={() => api.openApp("projects", { item: entry.id })}
                  >
                    {entry.title}
                  </Chip>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
