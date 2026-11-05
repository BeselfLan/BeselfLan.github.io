import { describe, expect, it } from "vitest";
import {
  EntrySchema,
  IdSchema,
  MediaManifestEntrySchema,
  ProfileSchema,
  SkillSchema,
} from "./schema";

const entry = {
  id: "tetris-asm",
  kind: "project",
  title: "Tetris",
  period: { start: "2024-01" },
  tech: ["c"],
  summary: "A game",
  bullets: ["one"],
  links: {},
  icon: "tetris.svg",
  featured: true,
  order: 1,
};
const skill = {
  id: "c",
  name: "C",
  category: "language",
  icon: "c.svg",
  color: "#aabbcc",
  description: "d",
  howIUsedIt: "h",
};
const profile = {
  name: "n",
  tagline: "t",
  location: "l",
  email: "a@example.com",
  github: "https://github.com/x",
  site: "https://example.com",
  summary: [],
  spokenLanguages: [],
};
const ok = (
  s: { safeParse: (v: unknown) => { success: boolean } },
  v: unknown,
) => s.safeParse(v).success;
const withEntry = (o: object) => ({ ...entry, ...o });

describe("EntrySchema", () => {
  it("parses a valid featured entry", () => {
    expect(ok(EntrySchema, entry)).toBe(true);
  });

  it.each([
    { start: "2024" },
    { start: "2024-01" },
    { start: "2024", end: "2025-06" },
    { start: "2024", end: "present" },
  ])("accepts period %j", (period) => {
    expect(ok(EntrySchema, withEntry({ period }))).toBe(true);
  });

  it.each([
    ["missing title", { title: undefined }],
    ["unknown kind", { kind: "game" }],
    ["month 13", { period: { start: "2025-13" } }],
    ["short github url", { links: { github: "owner/repo" } }],
    ["unknown key", { bootLable: "x" }],
  ])("rejects %s", (_n, patch) => {
    expect(ok(EntrySchema, withEntry(patch))).toBe(false);
  });

  it.each([
    ["unknown start", { period: { start: "unknown" } }],
    ["empty bullets", { bullets: [] }],
  ])("%s passes unfeatured and fails featured", (_n, patch) => {
    expect(ok(EntrySchema, withEntry({ ...patch, featured: false }))).toBe(
      true,
    );
    expect(ok(EntrySchema, withEntry({ ...patch, featured: true }))).toBe(
      false,
    );
  });
});

describe("IdSchema", () => {
  it.each(["3d-engine", "c", "utmist-ai2"])("accepts %s", (id) => {
    expect(ok(IdSchema, id)).toBe(true);
  });
  it("rejects Tetris_ASM", () => {
    expect(ok(IdSchema, "Tetris_ASM")).toBe(false);
  });
});

describe("SkillSchema", () => {
  it("parses a valid skill", () => {
    expect(ok(SkillSchema, skill)).toBe(true);
  });
  it.each([
    ["level 6", { level: 6 }],
    ["bad color", { color: "red" }],
    ["usedIn key", { usedIn: [] }],
  ])("rejects %s", (_n, patch) => {
    expect(ok(SkillSchema, { ...skill, ...patch })).toBe(false);
  });
});

describe("ProfileSchema", () => {
  it("parses a valid profile", () => {
    expect(ok(ProfileSchema, profile)).toBe(true);
  });
  it("rejects an unknown key", () => {
    expect(ok(ProfileSchema, { ...profile, phone: "private" })).toBe(false);
  });
});

describe("MediaManifestEntrySchema", () => {
  const media = {
    id: "demo",
    sources: [{ src: "media/demo.webm", type: "video/webm" }],
    poster: "media/demo.jpg",
    width: 640,
    height: 360,
    durationMs: 1234.5,
  };
  it("accepts relative src", () => {
    expect(ok(MediaManifestEntrySchema, media)).toBe(true);
  });
  it("rejects empty sources", () => {
    expect(ok(MediaManifestEntrySchema, { ...media, sources: [] })).toBe(false);
  });
});
