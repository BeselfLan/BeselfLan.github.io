import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootGroups,
  content,
  entriesByKind,
  featuredEntries,
  skillsWithUsage,
  type Content,
  type Entry,
  type Skill,
} from "./index";

const mkEntry = (id: string, o: Partial<Entry> = {}): Entry => ({
  id,
  kind: "project",
  title: id,
  period: { start: "2024" },
  tech: [],
  summary: "s",
  bullets: ["b"],
  links: {},
  icon: "i.svg",
  featured: false,
  order: 0,
  ...o,
});
const mkSkill = (id: string, o: Partial<Skill> = {}): Skill => ({
  id,
  name: id,
  category: "language",
  icon: "i.svg",
  color: "#000000",
  description: "d",
  howIUsedIt: "h",
  ...o,
});
const fixture: Content = {
  profile: content.profile,
  entries: [
    mkEntry("b", { order: 2, tech: ["c", "ts", "ghost"] }),
    mkEntry("a", { order: 1, tech: ["c"], featured: true }),
    mkEntry("f", { order: 0, kind: "hackathon", featured: true }),
    mkEntry("job", { order: 3, kind: "volunteer" }),
    mkEntry("competitive-programming", { order: 4, kind: "competition" }),
    mkEntry("comp", { order: 5, kind: "competition" }),
  ],
  education: [
    {
      id: "uni",
      school: "s",
      program: "p",
      location: "l",
      period: { start: "2020" },
      highlights: [],
    },
  ],
  courses: [],
  skills: [
    mkSkill("c"),
    mkSkill("ts"),
    mkSkill("tdd", { category: "practice" }),
    mkSkill("git", { category: "tool" }),
    mkSkill("react", { category: "framework" }),
  ],
  hobbies: [
    {
      id: "competitive-programming",
      name: "CP",
      period: { start: "2020" },
      bullets: [],
      icon: "i.svg",
    },
  ],
  certifications: [],
};

afterEach(() => {
  vi.doUnmock("./data/projects");
  vi.resetModules();
});

describe("module load", () => {
  it("parses the placeholder data", async () => {
    const mod = await import("./index");
    expect(mod.content.profile.name).toBeTruthy();
  });

  it("throws on a bad record", async () => {
    vi.resetModules();
    vi.doMock("./data/projects", () => ({ projects: [{ id: "Not Kebab" }] }));
    await expect(import("./index")).rejects.toThrow();
  });
});

const ids = (xs: { id: string }[]): string[] => xs.map((x) => x.id);

describe("skillsWithUsage", () => {
  const before = JSON.stringify(fixture);
  const out = skillsWithUsage(fixture);
  const used = (id: string): string[] =>
    ids(out.find((s) => s.id === id)?.usedIn ?? []);

  it("inverts Entry.tech in order", () => {
    expect(used("c")).toEqual(["a", "b"]);
  });
  it("keeps unused skills with empty usedIn", () => {
    expect(used("tdd")).toEqual([]);
    expect(ids(out)).toEqual(ids(fixture.skills));
  });
  it("ignores dangling tech ids and does not mutate", () => {
    expect(out.some((s) => s.id === "ghost")).toBe(false);
    expect(JSON.stringify(fixture)).toBe(before);
  });
  it("runs with no arguments", () => {
    expect(Array.isArray(skillsWithUsage())).toBe(true);
  });
});

describe("featuredEntries and entriesByKind", () => {
  it("filters featured and sorts by order", () => {
    expect(ids(featuredEntries(fixture))).toEqual(["f", "a"]);
  });
  it("returns all five kinds", () => {
    const g = entriesByKind(fixture);
    expect(Object.keys(g).sort()).toEqual([
      "competition",
      "experience",
      "hackathon",
      "project",
      "volunteer",
    ]);
    expect(ids(g.project)).toEqual(["a", "b"]);
    expect(g.experience).toEqual([]);
  });
  it("run with no arguments", () => {
    expect(Array.isArray(featuredEntries())).toBe(true);
    expect(Object.keys(entriesByKind())).toHaveLength(5);
  });
});

describe("bootGroups", () => {
  const g = bootGroups(fixture);
  it("puts every entry and skill in exactly one group", () => {
    const entryIds = [...g.projects, ...g.hackathons, ...g.experience].map(
      (e) => e.id,
    );
    expect(entryIds.sort()).toEqual(["a", "b", "comp", "f", "job"]);
    const skillIds = [...g.languages, ...g.skills].map((s) => s.id);
    expect(skillIds.sort()).toEqual(ids(fixture.skills).sort());
  });
  it("sorts featured first and keeps practice skills", () => {
    expect(ids(g.projects)).toEqual(["a", "b", "comp"]);
    expect(ids(g.skills)).toEqual(["react", "git", "tdd"]);
  });
  it("lists an entry sharing a hobby id only under hobbies", () => {
    expect(ids(g.hobbies)).toEqual(["competitive-programming"]);
    expect(ids(g.projects)).not.toContain("competitive-programming");
  });
  it("runs with no arguments", () => {
    expect(bootGroups().projects).toBeInstanceOf(Array);
  });
});
