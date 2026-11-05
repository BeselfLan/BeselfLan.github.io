import {
  ContentSchema,
  EntryKindSchema,
  type Content,
  type Education,
  type Entry,
  type EntryKind,
  type Hobby,
  type Skill,
} from "./schema";
import { profile } from "./data/profile";
import { projects } from "./data/projects";
import { experiences } from "./data/experiences";
import { education, courses, certifications } from "./data/education";
import { skills } from "./data/skills";
import { hobbies } from "./data/hobbies";
import { bootFlavour } from "./data/bootFlavour";

export * from "./schema";
export { bootFlavour };

/** Parsed at module load, so bad data fails the build. */
export const content: Content = ContentSchema.parse({
  profile,
  entries: [...projects, ...experiences],
  education,
  courses,
  skills,
  hobbies,
  certifications,
});

const byOrder = (a: Entry, b: Entry): number => a.order - b.order;
const featuredFirst = (a: Entry, b: Entry): number =>
  Number(b.featured) - Number(a.featured) || a.order - b.order;

/** Entries with `featured` true, sorted by `order`. */
export function featuredEntries(source: Content = content): Entry[] {
  return source.entries.filter((e) => e.featured).sort(byOrder);
}

/** All five kinds are always present; each list is sorted by `order`. */
export function entriesByKind(
  source: Content = content,
): Record<EntryKind, Entry[]> {
  const out = Object.fromEntries(
    EntryKindSchema.options.map((k) => [k, [] as Entry[]]),
  ) as Record<EntryKind, Entry[]>;
  for (const e of [...source.entries].sort(byOrder)) out[e.kind].push(e);
  return out;
}

export type SkillWithUsage = Skill & { usedIn: Entry[] };

/** Inverts `Entry.tech`. Unused skills stay with `usedIn: []`; dangling tech ids are ignored. */
export function skillsWithUsage(source: Content = content): SkillWithUsage[] {
  const sorted = [...source.entries].sort(byOrder);
  return source.skills.map((s) => ({
    ...s,
    usedIn: sorted.filter((e) => e.tech.includes(s.id)),
  }));
}

export interface BootGroups {
  projects: Entry[]; // kinds project + competition
  hackathons: Entry[]; // kind hackathon
  experience: Entry[]; // kinds experience + volunteer
  education: Education[];
  languages: Skill[]; // category language
  skills: Skill[]; // framework, library, tool, practice, in that order
  hobbies: Hobby[];
}

/**
 * Records for the boot log, grouped as in Appendix B. Entry groups sort
 * featured first, then by `order`. An entry whose id is also a hobby id
 * (competitive-programming) is left out of the entry groups so it prints once,
 * under hobbies. Other competition entries go in `projects`.
 */
export function bootGroups(source: Content = content): BootGroups {
  const hobbyIds = new Set(source.hobbies.map((h) => h.id));
  const entries = source.entries
    .filter((e) => !hobbyIds.has(e.id))
    .sort(featuredFirst);
  const kinds = (...ks: EntryKind[]): Entry[] =>
    entries.filter((e) => ks.includes(e.kind));
  const cats: Skill["category"][] = [
    "framework",
    "library",
    "tool",
    "practice",
  ];
  return {
    projects: kinds("project", "competition"),
    hackathons: kinds("hackathon"),
    experience: kinds("experience", "volunteer"),
    education: [...source.education],
    languages: source.skills.filter((s) => s.category === "language"),
    skills: cats.flatMap((c) => source.skills.filter((s) => s.category === c)),
    hobbies: [...source.hobbies],
  };
}
