import type { Skill } from "@beself/content";

// What a skill's emblem is (plan 6.7, D17 as amended on 2026-11-08). Every
// skill gets an original emblem drawn in code: its monogram on a light disc,
// ringed in `Skill.color`. No logo is reproduced and no image file is used, so
// nothing can 404 and no trademark is copied.
//
// Not even the three logos that their owners publish under an open licence
// (Git, HTML5 and R) are vendored. First, `packages/content`'s "every skill
// icon file exists" check is all-or-nothing: once one SVG sits directly in
// `public/icons/skills/`, all 49 must exist. Second, three logos among 46
// monograms would not read as one set. Override: vendor all 49 files in one
// commit with a `SOURCES.md` that names each source and licence, and draw
// `<Icon src={skill.icon} />` inside the same disc and ring in `SkillIcon`.
//
// Only types come from `@beself/content`, so a node test imports this file
// without the content package at runtime. No React here.

// Each is 1 to 4 characters. Override: edit the table. The accessible name of
// an emblem is the skill's name, so the monogram is `aria-hidden` and may be
// terse.
export const MONOGRAMS: Readonly<Record<string, string>> = Object.freeze({
  // Languages.
  python: "Py",
  java: "Java",
  "mips-asm": "MIPS",
  c: "C",
  cpp: "C++",
  sql: "SQL",
  typescript: "TS",
  javascript: "JS",
  html: "HTML",
  css: "CSS",
  r: "R",
  csharp: "C#",
  // Frameworks.
  react: "Re",
  nextjs: "Next",
  express: "Ex",
  nodejs: "Node",
  unity: "Un",
  remotion: "Rm",
  partykit: "PK",
  // Libraries.
  numpy: "np",
  pandas: "pd",
  pytorch: "PT",
  "scikit-learn": "skl",
  opencv: "CV",
  mediapipe: "MP",
  dexie: "Dx",
  "java-swing": "Sw",
  "gemini-api": "Gem",
  // Tools.
  git: "Git",
  github: "GH",
  bash: ">_",
  vscode: "VS",
  intellij: "IJ",
  pycharm: "PC",
  eclipse: "Ec",
  ssh: "SSH",
  docker: "Dkr",
  valgrind: "Vg",
  postgresql: "PG",
  nginx: "Ngx",
  caddy: "Cdy",
  posix: "PX",
  excel: "XL",
  powerpoint: "PPT",
  sharepoint: "SP",
  // Practices.
  oop: "OOP",
  agile: "Agl",
  "rest-api": "REST",
  "oauth-jwt": "JWT",
});

/**
 * The monogram of a skill. A skill that is in the content but not in the table
 * shows the first two characters of its name, so it still draws something
 * (skillIcon.test.ts fails for it in CI). `Object.hasOwn` keeps an id such as
 * "constructor" from reaching the prototype.
 */
export function monogramFor(skill: Pick<Skill, "id" | "name">): string {
  return Object.hasOwn(MONOGRAMS, skill.id)
    ? MONOGRAMS[skill.id]
    : skill.name.slice(0, 2);
}

/**
 * The disc is the `--os-panel-fg` token, which keeps the near-black brand
 * colours (nextjs, express, unity, intellij, pycharm, github, pandas, numpy)
 * visible on the dark theme. The text is the dark aubergine, at least 7:1 on
 * the disc (about 17.4).
 */
export const EMBLEM_DISC = "#F7F7F7";
export const EMBLEM_TEXT = "#2C001E";

/** The ring around the disc: 7 percent of the size, never under 2 units. */
export function ringWidth(size: number): number {
  return Math.max(2, Math.round(size * 0.07));
}

/**
 * The font size of a monogram on an emblem of `size`: it steps down with the
 * number of characters so that 4 still fit in the disc. `[...text]` counts
 * characters, not UTF-16 units.
 */
export function emblemFontSize(text: string, size: number): number {
  const n = [...text].length;
  return Math.round(size * (n <= 2 ? 0.36 : n === 3 ? 0.29 : 0.23));
}
