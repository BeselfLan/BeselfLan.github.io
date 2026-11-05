import { ContentSchema, type Content } from "./schema";
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
