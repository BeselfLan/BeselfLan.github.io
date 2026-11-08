import type {
  BootGroups,
  Certification,
  Course,
  Education,
  Entry,
  EntryKind,
  Hobby,
  Profile,
  Skill,
  SkillWithUsage,
} from "@beself/content";

/**
 * What an app reads its content through (D9, plan 3.2). It is synchronous
 * because content lives in code. D9's own override, content from the backend,
 * would add a loading state and make this async.
 *
 * Lists are read-only and the same object on every call: apps call these in
 * render and in hook dependency lists. Callers must not mutate what they get.
 */
export interface ContentProvider {
  profile(): Profile;
  entries(): readonly Entry[];
  entry(id: string): Entry | undefined;
  /** Entries with `featured` true, sorted by `order`. */
  featuredEntries(): readonly Entry[];
  /** All five kinds are present; each list is sorted by `order`. */
  entriesByKind(): Readonly<Record<EntryKind, readonly Entry[]>>;
  skills(): readonly Skill[];
  skill(id: string): Skill | undefined;
  /** Every skill with the entries that use it, so `usedIn` is never hand-kept. */
  skillsWithUsage(): readonly SkillWithUsage[];
  education(): readonly Education[];
  courses(): readonly Course[];
  certifications(): readonly Certification[];
  hobbies(): readonly Hobby[];
  /** Records for the boot log, grouped as in Appendix B. */
  bootGroups(): BootGroups;
  bootFlavour(): readonly string[];
}
