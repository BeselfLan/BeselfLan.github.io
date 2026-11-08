// The tabs of the Skills app and what each one lists (plan 6.6, D23).
//
// Every import here is `import type`: `os/apps/registry.ts` loads the app's
// `index.ts` into the page's first chunk, and `index.ts` imports this file, so
// a value import of the content package would grow that chunk (plan 8.3).
//
// The tab ids are the `SkillCategory` values, so a tab is a filter on
// `category`. Practices have no tab: D23 shows them as chips in the footer
// under every tab. Override: a sixth { id: "practice", label: "Practices" } tab
// and a `practice` case in `skillsFor`.

import type { Skill, SkillCategory } from "@beself/content";
import type { ContentProvider } from "@/content/provider";

export const TABS = [
  { id: "all", label: "All" },
  { id: "language", label: "Languages" },
  { id: "framework", label: "Frameworks" },
  { id: "library", label: "Libraries" },
  { id: "tool", label: "Tools" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

/** The app opens on All. */
export const DEFAULT_TAB: TabId = "all";

export function isTabId(value: unknown): value is TabId {
  return TABS.some((t) => t.id === value);
}

/** The singular label of a category, for the panel. */
export const CATEGORY_LABEL: Readonly<Record<SkillCategory, string>> = {
  language: "Language",
  framework: "Framework",
  library: "Library",
  tool: "Tool",
  practice: "Practice",
};

/** The part of the provider this file reads. */
export type TabSource = Pick<ContentProvider, "skills" | "skill">;

/**
 * The skills a tab lists, in content order. All is every skill except the
 * practices. Each result is a new array: `content.skills()` is the content
 * package's own array, shared by every app, so it is never sorted or mutated.
 */
export function skillsFor(tab: TabId, content: TabSource): readonly Skill[] {
  return content
    .skills()
    .filter((s) =>
      tab === "all" ? s.category !== "practice" : s.category === tab,
    );
}

/** The practices, in content order. They are chips under every tab (D23). */
export function practicesOf(content: TabSource): readonly Skill[] {
  return content.skills().filter((s) => s.category === "practice");
}

/**
 * Whether `skill` shows under `tab`: a practice under every tab (its chip is
 * always there), any skill under All, and otherwise the tab of its category.
 * The starting view and a tab switch share this one rule.
 */
export function visibleIn(skill: Pick<Skill, "category">, tab: TabId): boolean {
  return (
    skill.category === "practice" || tab === "all" || skill.category === tab
  );
}

export interface SkillsView {
  tab: TabId;
  /** The skill to open in the panel, or null for none. */
  selectedId: string | null;
}

/**
 * The starting tab and selection for a window's args. An unknown tab falls
 * back to All, and an item that is not a skill is ignored. An item that is not
 * visible under the tab (Python under Tools) switches the view to All, so a
 * link lands with its panel open. A practice is visible everywhere, so its tab
 * stays.
 *
 * It reads `args` only: they are frozen.
 */
export function viewFor(
  args: { item?: unknown; tab?: unknown },
  content: TabSource,
): SkillsView {
  let tab = isTabId(args.tab) ? args.tab : DEFAULT_TAB;
  if (typeof args.item !== "string") return { tab, selectedId: null };
  const skill = content.skill(args.item);
  if (!skill) return { tab, selectedId: null };
  if (!visibleIn(skill, tab)) tab = "all";
  return { tab, selectedId: skill.id };
}
