import * as pkg from "@beself/content";
import { describe, expect, it } from "vitest";
import { staticContent as c } from "@/content/static";

describe("the static content provider", () => {
  it("returns the package data", () => {
    expect(c.profile()).toEqual(pkg.content.profile);
    expect(c.featuredEntries()).toEqual(pkg.featuredEntries());
    expect(c.entriesByKind()).toEqual(pkg.entriesByKind());
    expect(c.skillsWithUsage()).toEqual(pkg.skillsWithUsage());
    expect(c.bootGroups()).toEqual(pkg.bootGroups());
    expect(c.entries()).toEqual(pkg.content.entries);
    expect(c.skills()).toEqual(pkg.content.skills);
    expect(c.education()).toEqual(pkg.content.education);
    expect(c.courses()).toEqual(pkg.content.courses);
    expect(c.certifications()).toEqual(pkg.content.certifications);
    expect(c.hobbies()).toEqual(pkg.content.hobbies);
    expect(c.bootFlavour()).toEqual(pkg.bootFlavour);
  });

  it("finds an entry and a skill by id", () => {
    const first = c.featuredEntries()[0];
    expect(first).toBeDefined();
    expect(c.entry(first.id)).toEqual(first);
    expect(c.entry("nope")).toBeUndefined();

    const skill = c.skills()[0];
    expect(skill).toBeDefined();
    expect(c.skill(skill.id)).toEqual(skill);
    expect(c.skill("nope")).toBeUndefined();
  });

  it("derived lists are the same object on every call", () => {
    expect(c.featuredEntries()).toBe(c.featuredEntries());
    expect(c.entriesByKind()).toBe(c.entriesByKind());
    expect(c.skillsWithUsage()).toBe(c.skillsWithUsage());
    expect(c.bootGroups()).toBe(c.bootGroups());
  });
});
