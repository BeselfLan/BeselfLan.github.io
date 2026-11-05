import { describe, expect, it } from "vitest";
import { bootFlavour, content } from "./index";

const phoneShaped = (s: string): boolean =>
  /(?:\d[^A-Za-z0-9]{0,3}){9,}\d/.test(s);
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

describe("safety", () => {
  it("detector works on values built at runtime", () => {
    const d = "9".repeat(3);
    expect(phoneShaped("9".repeat(10))).toBe(true);
    expect(phoneShaped([d, d, "9".repeat(4)].join("-"))).toBe(true);
    for (const sep of ["/", "_", "–"]) {
      expect(phoneShaped([d, d, "9".repeat(4)].join(sep))).toBe(true);
    }
    expect(phoneShaped("2021-2024")).toBe(false);
  });

  it("no phone-shaped value in content or bootFlavour", () => {
    expect(phoneShaped(everything)).toBe(false);
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
