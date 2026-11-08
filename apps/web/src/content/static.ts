import {
  bootFlavour,
  bootGroups,
  content,
  entriesByKind,
  featuredEntries,
  skillsWithUsage,
} from "@beself/content";
import type { ContentProvider } from "./provider";

// The derived values are built on first use and then returned as the same
// object every time. Content never changes at runtime, and apps call these in
// render or put them in hook dependencies. Override: compute per call.
function once<T>(make: () => T): () => T {
  let box: { value: T } | undefined;
  return () => (box ??= { value: make() }).value;
}

/** The provider over `@beself/content`. Reads no `window` at import. */
export const staticContent: ContentProvider = {
  profile: () => content.profile,
  entries: () => content.entries,
  entry: (id) => content.entries.find((e) => e.id === id),
  featuredEntries: once(() => featuredEntries()),
  entriesByKind: once(() => entriesByKind()),
  skills: () => content.skills,
  skill: (id) => content.skills.find((s) => s.id === id),
  skillsWithUsage: once(() => skillsWithUsage()),
  education: () => content.education,
  courses: () => content.courses,
  certifications: () => content.certifications,
  hobbies: () => content.hobbies,
  bootGroups: once(() => bootGroups()),
  bootFlavour: () => bootFlavour,
};
