import { z } from "zod";

const Str = z.string().min(1);

export const IdSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export type SkillId = z.infer<typeof IdSchema>;
export type MediaId = z.infer<typeof IdSchema>;
export type EntryId = z.infer<typeof IdSchema>;

export const PeriodDateSchema = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/);
export type PeriodDate = z.infer<typeof PeriodDateSchema>;

export const PeriodSchema = z.strictObject({
  start: PeriodDateSchema,
  end: z.union([PeriodDateSchema, z.literal("present")]).optional(),
});
export type Period = z.infer<typeof PeriodSchema>;

export const EntryPeriodSchema = z.strictObject({
  start: z.union([PeriodDateSchema, z.literal("unknown")]),
  end: z.union([PeriodDateSchema, z.literal("present")]).optional(),
});
export type EntryPeriod = z.infer<typeof EntryPeriodSchema>;

export const EntryKindSchema = z.enum([
  "project",
  "hackathon",
  "experience",
  "volunteer",
  "competition",
]);
export type EntryKind = z.infer<typeof EntryKindSchema>;

export const SkillCategorySchema = z.enum([
  "language",
  "framework",
  "library",
  "tool",
  "practice",
]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

export const ProfileSchema = z.strictObject({
  name: Str,
  tagline: Str,
  location: Str,
  email: z.email(),
  github: z.httpUrl(),
  site: z.httpUrl(),
  summary: z.array(Str),
  spokenLanguages: z.array(Str),
  avatar: Str.optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const EntrySchema = z
  .strictObject({
    id: IdSchema,
    kind: EntryKindSchema,
    title: Str,
    org: Str.optional(),
    role: Str.optional(),
    period: EntryPeriodSchema,
    tech: z.array(IdSchema),
    summary: Str,
    bullets: z.array(Str),
    links: z.strictObject({
      github: z.httpUrl().optional(),
      demo: z.httpUrl().optional(),
      site: z.httpUrl().optional(),
    }),
    media: z
      .strictObject({ video: IdSchema.optional(), poster: Str.optional() })
      .optional(),
    icon: Str,
    featured: z.boolean(),
    order: z.number().int(),
    bootLabel: Str.optional(),
  })
  .superRefine((entry, ctx) => {
    if (!entry.featured) return;
    if (entry.period.start === "unknown") {
      ctx.addIssue({
        code: "custom",
        path: ["period", "start"],
        message: "featured entries need a known start date",
      });
    }
    if (entry.bullets.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["bullets"],
        message: "featured entries need at least one bullet",
      });
    }
  });
export type Entry = z.infer<typeof EntrySchema>;

export const EducationSchema = z.strictObject({
  id: IdSchema,
  school: Str,
  program: Str,
  location: Str,
  period: PeriodSchema,
  gpa: Str.optional(),
  highlights: z.array(Str),
});
export type Education = z.infer<typeof EducationSchema>;

export const CourseSchema = z.strictObject({
  code: Str.optional(),
  name: Str,
});
export type Course = z.infer<typeof CourseSchema>;

export const SkillSchema = z.strictObject({
  id: IdSchema,
  name: Str,
  category: SkillCategorySchema,
  icon: Str,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: Str,
  howIUsedIt: Str,
  level: z.number().int().min(1).max(5).optional(),
  since: PeriodDateSchema.optional(),
});
export type Skill = z.infer<typeof SkillSchema>;

export const HobbySchema = z.strictObject({
  id: IdSchema,
  name: Str,
  period: PeriodSchema,
  bullets: z.array(Str),
  icon: Str,
});
export type Hobby = z.infer<typeof HobbySchema>;

export const CertificationSchema = z.strictObject({
  name: Str,
  issuer: Str,
  year: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});
export type Certification = z.infer<typeof CertificationSchema>;

export const MediaManifestEntrySchema = z.strictObject({
  id: IdSchema,
  sources: z.array(z.strictObject({ src: Str, type: Str })).min(1),
  poster: Str,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationMs: z.number().positive(),
});
export type MediaManifestEntry = z.infer<typeof MediaManifestEntrySchema>;

export const MediaManifestSchema = z.array(MediaManifestEntrySchema);
export type MediaManifest = z.infer<typeof MediaManifestSchema>;

export const ContentSchema = z.strictObject({
  profile: ProfileSchema,
  entries: z.array(EntrySchema),
  education: z.array(EducationSchema),
  courses: z.array(CourseSchema),
  skills: z.array(SkillSchema),
  hobbies: z.array(HobbySchema),
  certifications: z.array(CertificationSchema),
});

export type Content = z.infer<typeof ContentSchema>;
