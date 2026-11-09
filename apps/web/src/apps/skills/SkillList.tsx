"use client";

import type { Skill } from "@beself/content";
import { useId } from "react";
import { SkillIcon } from "./SkillIcon";
import { CATEGORY_LABEL } from "./tabs";

// The list view (plan 6.6): the tab's skills as a grid of cards, then the
// practices. It is the accessible fallback of the floating stage and the
// default under reduced motion: plain buttons in content order, with no
// physics, no pointer maths and no animation frame. Each card is a Tab stop
// that selects its skill, which opens the same panel as an icon does.

export interface SkillListProps {
  /** The tab's skills, from `skillsFor`. */
  skills: readonly Skill[];
  /** The practices, from `practicesOf`. */
  practices: readonly Skill[];
  selectedId: string | null;
  onSelect(id: string): void;
  /** The id the open card's `aria-controls` names. */
  panelId: string;
  /** Pixels of right padding kept for the open panel, 0 when it is shut. */
  reserve: number;
}

export function SkillList({
  skills,
  practices,
  selectedId,
  onSelect,
  panelId,
  reserve,
}: SkillListProps) {
  const headingId = useId();

  const card = (s: Skill) => {
    const open = s.id === selectedId;
    return (
      <button
        key={s.id}
        type="button"
        data-skill-card={s.id}
        data-selected={open ? "" : undefined}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="skills-card"
        onClick={() => onSelect(s.id)}
      >
        <SkillIcon skill={s} size={48} />
        <span className="skills-card-name">{s.name}</span>
        <span className="skills-card-kind">{CATEGORY_LABEL[s.category]}</span>
      </button>
    );
  };

  return (
    <div
      data-skill-list=""
      className="min-h-0 flex-1 overflow-y-auto p-4"
      // Room for the open panel, which sits over the right of this row.
      style={reserve ? { paddingRight: reserve + 16 } : undefined}
    >
      <div data-skill-cards="" className="skills-list-grid">
        {skills.map(card)}
      </div>
      {practices.length > 0 && (
        <section aria-labelledby={headingId} className="mt-6">
          <h3 id={headingId} className="mb-2 text-sm font-semibold opacity-70">
            Practices
          </h3>
          <div data-skill-practices="" className="skills-list-grid">
            {practices.map(card)}
          </div>
        </section>
      )}
    </div>
  );
}
