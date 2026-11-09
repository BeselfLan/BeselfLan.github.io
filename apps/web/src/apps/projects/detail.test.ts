// @vitest-environment node
import { EntryKindSchema, type EntryPeriod } from "@beself/content";
import { describe, expect, it } from "vitest";
import {
  entryLinks,
  KIND_LABELS,
  PANEL_SHIFT,
  PANEL_WIDTH,
  periodLabel,
} from "./detail";

describe("periodLabel", () => {
  // The dash is U+2013, written out so the character is unambiguous.
  it.each<[string, EntryPeriod, string | null]>([
    ["one year", { start: "2024" }, "2024"],
    ["a range", { start: "2023", end: "2024" }, "2023–2024"],
    ["the same year twice", { start: "2022", end: "2022" }, "2022"],
    ["months in the same year", { start: "2024-01", end: "2024-06" }, "2024"],
    ["months in a range", { start: "2023-09", end: "2025-04" }, "2023–2025"],
    ["an open end", { start: "2026", end: "present" }, "2026–present"],
    [
      "an open end from a month",
      { start: "2021-09", end: "present" },
      "2021–present",
    ],
    ["an unknown start", { start: "unknown" }, null],
    ["an unknown start with an end", { start: "unknown", end: "2024" }, null],
  ])("%s", (_name, period, expected) => {
    expect(periodLabel(period)).toBe(expected);
  });
});

describe("KIND_LABELS", () => {
  it("has a label for every kind", () => {
    expect(Object.keys(KIND_LABELS).sort()).toEqual(
      [...EntryKindSchema.options].sort(),
    );
    expect(KIND_LABELS).toEqual({
      project: "Project",
      hackathon: "Hackathon",
      experience: "Experience",
      volunteer: "Volunteer",
      competition: "Competition",
    });
  });
});

describe("entryLinks", () => {
  it("comes out in a fixed order, whatever the object's order", () => {
    expect(
      entryLinks({
        demo: "https://demo.example/",
        site: "https://site.example/",
        github: "https://github.com/x/y",
      }),
    ).toEqual([
      { label: "GitHub", href: "https://github.com/x/y" },
      { label: "Website", href: "https://site.example/" },
      { label: "Live demo", href: "https://demo.example/" },
    ]);
  });

  it("lists only the links that exist", () => {
    expect(entryLinks({})).toEqual([]);
    expect(entryLinks({ site: "https://site.example/" })).toEqual([
      { label: "Website", href: "https://site.example/" },
    ]);
    expect(
      entryLinks({
        github: "https://github.com/x/y",
        demo: "https://demo.example/",
      }).map((l) => l.label),
    ).toEqual(["GitHub", "Live demo"]);
  });
});

describe("the panel's size", () => {
  it("shifts the ring by half the panel's width", () => {
    expect(PANEL_WIDTH).toBe(380);
    expect(PANEL_SHIFT).toBe(190);
  });
});
