import { describe, expect, it } from "vitest";
import { bootFlavour, content, skillsWithUsage } from "./index";

const phoneShaped = (s: string): boolean =>
  /(?:\+?\d[\s().-]*){10,}|(?:\d[^A-Za-z0-9]{0,3}){9,}\d/.test(s);
const emails = (s: string): string[] =>
  s.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
const streetShaped = (s: string): boolean =>
  /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Dr|Drive|Ave|Avenue|St|Street|Rd|Road|Blvd|Boulevard|Cres|Crescent|Ct|Court|Way|Lane|Ln)\b/.test(
    s,
  );
const everything = JSON.stringify({ content, bootFlavour });

// id kind period featured video tech... ("-" for none)
const INVENTORY = [
  "bash-shell project 2026-present F - c posix valgrind python",
  "tetris-asm project 2025 F - mips-asm",
  "trivia-knockouts project 2026-present F - react typescript nextjs python gemini-api postgresql partykit",
  "todo-fullstack project 2026-present F - javascript typescript react express nodejs postgresql docker caddy",
  "invoice-creator project 2026-present F - react typescript dexie",
  "painting-ml project 2026 F - python numpy pandas scikit-learn",
  "deadknight project 2024 F deadknight java git github",
  "3d-engine project 2023-2024 F 3d-engine java java-swing",
  "competitive-programming competition 2021-present F - python cpp",
  "portfolio-site project 2023-present F - html css react nextjs typescript",
  "emberhacks hackathon 2026 F - python opencv mediapipe gemini-api",
  "utmist-ai2 hackathon 2025 F - python pytorch git",
  "thornhill-cs-club experience 2021-2024 F - -",
  "kortright-volunteer volunteer 2022-2023 - - -",
  "thornhill-concerts volunteer 2022-2024 - - -",
  "music-council volunteer 2022-2024 - - -",
  "fnaf-project project 2024 - fnaf java",
  "pong project 2024 - - java",
  "flappybird project 2025 - - unity csharp",
  "poker-trainer project 2025 - - python",
  "honeypot project 2026 - - typescript nodejs",
  "edu-video-generator project 2026 - - typescript remotion",
  "stock-change-predictor project 2026 - - python",
];

describe("entry inventory (Appendix A.1)", () => {
  it("has exactly the listed entries", () => {
    expect(content.entries).toHaveLength(INVENTORY.length);
    expect(content.entries.map((e) => e.id).sort()).toEqual(
      INVENTORY.map((r) => r.split(" ")[0]).sort(),
    );
  });

  it("entry ids are unique", () => {
    const ids = content.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(INVENTORY)("%s matches its row", (row) => {
    const [id, kind, period, featured, video, ...tech] = row.split(" ");
    const e = content.entries.find((x) => x.id === id);
    expect(e).toBeDefined();
    expect(e?.kind).toBe(kind);
    const [start, end] = period.split("-");
    expect(e?.period).toEqual(end ? { start, end } : { start });
    expect(e?.featured).toBe(featured === "F");
    expect(e?.media?.video).toBe(video === "-" ? undefined : video);
    expect(e?.tech).toEqual(tech[0] === "-" ? [] : tech);
  });

  it("every featured entry has 3 to 5 bullets", () => {
    for (const e of content.entries.filter((x) => x.featured)) {
      expect(e.bullets.length).toBeGreaterThanOrEqual(3);
      expect(e.bullets.length).toBeLessThanOrEqual(5);
    }
  });

  it("every summary is one sentence", () => {
    for (const e of content.entries) {
      expect(e.summary).not.toMatch(/[.!?]\s+\S/);
    }
  });

  it("tetris says MIPS", () => {
    const t = content.entries.find((e) => e.id === "tetris-asm");
    expect(JSON.stringify(t)).toMatch(/MIPS/);
  });
});

const SKILLS = {
  language:
    "python java mips-asm c cpp sql typescript javascript html css r csharp",
  framework: "react nextjs express nodejs unity remotion partykit",
  library:
    "numpy pandas pytorch scikit-learn opencv mediapipe dexie java-swing gemini-api",
  tool: "git github bash vscode intellij pycharm eclipse ssh docker valgrind postgresql nginx caddy posix excel powerpoint sharepoint",
  practice: "oop agile rest-api oauth-jwt",
};
// Not in any entry's tech list, but a source ties them to an entry.
const LINKED = "sql nginx rest-api oauth-jwt bash oop".split(" ");
// Nothing in the sources beyond the name.
const UNSOURCED =
  "r vscode intellij pycharm eclipse ssh excel powerpoint sharepoint agile".split(
    " ",
  );

const shortTitle = (title: string): string =>
  title.split(/ --| \(| in | for | with /)[0].toLowerCase();
const sentences = (s: string): number => s.trim().split(/(?<=[.!?])\s+/).length;
const FIRST_PERSON = /\b(I|my)\b/;
const allShortTitles = content.entries.map((e) => shortTitle(e.title));

describe("skills", () => {
  const usage = skillsWithUsage();

  it.each(Object.entries(SKILLS))(
    "has exactly the listed %s skills",
    (category, ids) => {
      const actual = content.skills
        .filter((s) => s.category === category)
        .map((s) => s.id)
        .sort();
      expect(actual).toEqual(ids.split(" ").sort());
    },
  );

  it("has 49 skills with unique ids", () => {
    const ids = content.skills.map((s) => s.id);
    expect(ids).toHaveLength(49);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every tech id is a skill", () => {
    const ids = new Set(content.skills.map((s) => s.id));
    for (const e of content.entries) {
      for (const t of e.tech) expect(ids.has(t), `${e.id}: ${t}`).toBe(true);
    }
  });

  it("exactly these 16 skills have no entry", () => {
    const unused = usage
      .filter((s) => s.usedIn.length === 0)
      .map((s) => s.id)
      .sort();
    expect(unused).toEqual([...LINKED, ...UNSOURCED].sort());
  });

  it("every skill is used or described", () => {
    for (const s of usage) {
      expect(s.usedIn.length > 0 || s.howIUsedIt.trim() !== "", s.id).toBe(
        true,
      );
    }
  });

  it("descriptions are neutral and short", () => {
    for (const s of content.skills) {
      expect(sentences(s.description), s.id).toBeLessThanOrEqual(2);
      expect(s.description, s.id).not.toMatch(/\b(I|my|me|we)\b/);
    }
  });

  it("used skills say how and name an entry that uses them", () => {
    const used = usage.filter((s) => s.usedIn.length > 0);
    expect(used).toHaveLength(33);
    for (const s of used) {
      const copy = s.howIUsedIt.toLowerCase();
      expect(s.howIUsedIt, s.id).toMatch(FIRST_PERSON);
      expect(sentences(s.howIUsedIt), s.id).toBeGreaterThanOrEqual(2);
      expect(sentences(s.howIUsedIt), s.id).toBeLessThanOrEqual(3);
      expect(
        s.usedIn.some((e) => copy.includes(shortTitle(e.title))),
        s.id,
      ).toBe(true);
    }
  });

  it("linked skills name their entry", () => {
    const entryFor: Record<string, string> = {
      sql: "full-stack todo list",
      nginx: "full-stack todo list",
      "rest-api": "full-stack todo list",
      "oauth-jwt": "full-stack todo list",
      bash: "bash terminal recreation",
      oop: "deadknight",
    };
    for (const id of LINKED) {
      const s = content.skills.find((x) => x.id === id);
      expect(s?.howIUsedIt.toLowerCase(), id).toContain(entryFor[id]);
      expect(s?.howIUsedIt, id).toMatch(FIRST_PERSON);
    }
  });

  it("unsourced skills stay honest", () => {
    for (const id of UNSOURCED) {
      const s = content.skills.find((x) => x.id === id);
      const copy = s?.howIUsedIt ?? "";
      expect(sentences(copy), id).toBe(1);
      expect(copy, id).toMatch(FIRST_PERSON);
      for (const t of allShortTitles) {
        expect(copy.toLowerCase(), `${id}: ${t}`).not.toContain(t);
      }
    }
  });

  it("mips-asm says MIPS", () => {
    const s = content.skills.find((x) => x.id === "mips-asm");
    expect(s?.name).toBe("MIPS Assembly");
    expect(s?.description).toMatch(/MIPS/);
    expect(s?.howIUsedIt).toMatch(/MIPS/);
  });

  it("icons follow the id", () => {
    for (const s of content.skills) {
      expect(s.icon).toBe(`/icons/skills/${s.id}.svg`);
    }
  });

  it("level and since stay unset", () => {
    for (const s of content.skills) {
      expect(s.level, s.id).toBeUndefined();
      expect(s.since, s.id).toBeUndefined();
    }
  });

  it("copy about this website claims nothing unshipped", () => {
    const about = content.skills.filter((s) =>
      s.howIUsedIt.toLowerCase().includes("this website"),
    );
    expect(about.length).toBeGreaterThan(0);
    for (const s of about) {
      expect(s.howIUsedIt, s.id).not.toMatch(
        /\b(laptop|boot|desktop|dock|windows?|carousel|deployed|live|fails the build|will)\b/i,
      );
    }
  });
});

describe("safety", () => {
  it("detector works on values built at runtime", () => {
    const d = "9".repeat(3);
    expect(phoneShaped("9".repeat(10))).toBe(true);
    expect(phoneShaped([d, d, "9".repeat(4)].join("-"))).toBe(true);
    for (const sep of ["/", "_", "–"]) {
      expect(phoneShaped([d, d, "9".repeat(4)].join(sep))).toBe(true);
    }
    // Wide spacing: only the first alternative catches it.
    expect(phoneShaped([d, d, "9".repeat(4)].join("    "))).toBe(true);
    expect(phoneShaped("2021-2024")).toBe(false);
  });

  it("no phone-shaped value in content or bootFlavour", () => {
    expect(phoneShaped(everything)).toBe(false);
  });

  it("email detector works", () => {
    expect(emails(["a", "b.org"].join("@"))).toHaveLength(1);
    // One boot line holds a bare @, so the character alone is not a test.
    expect(emails("x @ y")).toEqual([]);
  });

  it("the only address in the data is the profile's", () => {
    expect(emails(everything)).toEqual([content.profile.email]);
  });

  it("street detector works", () => {
    expect(streetShaped(["12", "Sample", "Road"].join(" "))).toBe(true);
    expect(streetShaped("no address here")).toBe(false);
  });

  it("no street address in content or bootFlavour", () => {
    expect(streetShaped(everything)).toBe(false);
  });

  it("RISC-V never appears", () => {
    expect(everything).not.toMatch(/risc\W?v/i);
  });

  it("the unmeasured 15x and 16x claims never appear", () => {
    expect(everything).not.toMatch(
      /\b(?:15|16)\s*(?:x\b|×)|(?:\bx|×)\s*(?:15|16)\b/i,
    );
  });

  const trivia = content.entries.find((e) => e.id === "trivia-knockouts");
  it.skipIf(!trivia)("trivia makes no parallel claim", () => {
    expect(JSON.stringify(trivia)).not.toMatch(/parallel|concurren/i);
  });
});
