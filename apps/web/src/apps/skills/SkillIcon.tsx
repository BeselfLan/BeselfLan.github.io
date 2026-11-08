import type { Skill } from "@beself/content";
import {
  EMBLEM_DISC,
  EMBLEM_TEXT,
  emblemFontSize,
  monogramFor,
  ringWidth,
} from "./skillIcon";

export interface SkillIconProps {
  skill: Pick<Skill, "id" | "name" | "color">;
  /** The width and height of the disc, in screen units. */
  size: number;
}

/**
 * A skill's emblem (plan 6.7, D17 as amended): its monogram on a light disc,
 * ringed in the skill's own colour. It is drawn in HTML, so the text uses the
 * site's Ubuntu font, and no image is involved. The size and the colours go in
 * `style` and never in a class built at runtime, because Tailwind generates
 * only the class names that are written out in the source. The emblem is
 * `aria-hidden`: the accessible name belongs to whatever holds it (a button
 * named after the skill).
 */
export function SkillIcon({ skill, size }: SkillIconProps) {
  const text = monogramFor(skill);
  return (
    <span
      data-skill-icon=""
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center font-bold leading-none select-none"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        boxSizing: "border-box",
        backgroundColor: EMBLEM_DISC,
        borderWidth: ringWidth(size),
        borderStyle: "solid",
        borderColor: skill.color,
        color: EMBLEM_TEXT,
        fontSize: emblemFontSize(text, size),
      }}
    >
      {text}
    </span>
  );
}
