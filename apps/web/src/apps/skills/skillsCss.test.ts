// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// skills.css is a global stylesheet (CSS Modules are unscoped for now, #86), so
// every name in it must carry the skills- prefix or it could hit another app's
// element. The test reads the file as text, with the comments taken out.

const read = (file: string) =>
  readFileSync(join(import.meta.dirname, file), "utf8");
const css = read("skills.css").replace(/\/\*[\s\S]*?\*\//g, "");

const KEYFRAMES = /@keyframes\s+([\w-]+)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g;
const keyframeNames = [...css.matchAll(KEYFRAMES)].map((m) => m[1]);

// What is left once the keyframes and every declaration block are gone is the
// selectors, so a dot in a value (0.75) is never read as a class.
const selectors = css.replace(KEYFRAMES, "").replace(/\{[^{}]*\}/g, "{}");
const classNames = [
  ...new Set(
    [...selectors.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]),
  ),
];

describe("skills.css", () => {
  it("has the classes the stage and the panel use, and the two keyframes", () => {
    // A guard against the parsing finding nothing and passing for it.
    expect(classNames).toEqual(
      expect.arrayContaining([
        "skills-stage",
        "skills-set",
        "skills-set-enter",
        "skills-icon",
        "skills-face",
        "skills-label",
        "skills-panel",
        "skills-panel-enter",
      ]),
    );
    expect([...keyframeNames].sort()).toEqual([
      "skills-fade-in",
      "skills-panel-in",
    ]);
  });

  it("starts every class selector with skills-", () => {
    expect(classNames.filter((n) => !n.startsWith("skills-"))).toEqual([]);
  });

  it("starts every @keyframes name with skills-", () => {
    expect(keyframeNames.filter((n) => !n.startsWith("skills-"))).toEqual([]);
  });

  it("uses only the skills- animation it defines", () => {
    const used = [...css.matchAll(/animation:\s*([\w-]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) expect(keyframeNames).toContain(name);
  });

  it("defines and reads only --skills- and --os- properties", () => {
    const names = [...new Set(css.match(/--[\w-]+/g) ?? [])];
    expect(names.length).toBeGreaterThan(0);
    expect(
      names.filter((n) => !n.startsWith("--skills-") && !n.startsWith("--os-")),
    ).toEqual([]);
  });

  it("styles every skills- class the components name", () => {
    const used = new Set<string>();
    for (const file of ["SkillsStage.tsx", "SkillsApp.tsx", "SkillPanel.tsx"]) {
      for (const m of read(file).matchAll(/["' ](skills-[\w-]+)/g)) {
        used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(classNames, name).toContain(name);
  });

  it("sets only --skills- properties inline, and the stylesheet reads them", () => {
    const inline = ["SkillsStage.tsx", "SkillPanel.tsx"].flatMap((file) =>
      [...read(file).matchAll(/"(--[\w-]+)"/g)].map((m) => m[1]),
    );
    expect(inline.length).toBeGreaterThan(0);
    for (const name of inline) {
      expect(name.startsWith("--skills-"), name).toBe(true);
      expect(css, name).toContain(name);
    }
  });

  it("is imported by SkillsApp.tsx, the lazy chunk", () => {
    expect(read("SkillsApp.tsx")).toContain('import "./skills.css";');
    // Not by the file the first chunk loads.
    expect(read("index.ts")).not.toContain("skills.css");
  });
});
