// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { content, type BootGroups, type Entry } from "@beself/content";
import { staticContent } from "@/content/static";
import {
  bootLogDuration,
  buildBootScript,
  HEADER_PAUSE_MS,
  LOG_BUDGET_MS,
  LOG_MAX_MS,
  type BootGroup,
  type BootLine,
  type BootSource,
} from "./bootScript";

const OPTIONS = { random: () => 0.5, year: 2026 };

const today = (): BootLine[] => buildBootScript(staticContent, OPTIONS);

/** The one line that reports `id`. */
function lineFor(script: readonly BootLine[], id: string): BootLine {
  const line = script.find((l) => l.ids.includes(id));
  if (!line) throw new Error(`no boot line for ${id}`);
  return line;
}

/** A source over the real content with some of the boot groups replaced. */
function withGroups(over: (g: BootGroups) => Partial<BootGroups>): BootSource {
  return {
    ...staticContent,
    bootGroups: () => ({
      ...staticContent.bootGroups(),
      ...over(staticContent.bootGroups()),
    }),
  };
}

function entry(id: string): Entry {
  const found = content.entries.find((e) => e.id === id);
  if (!found) throw new Error(`no entry ${id}`);
  return found;
}

const hobbyIds = new Set(content.hobbies.map((h) => h.id));

describe("boot script lines", () => {
  it("prints every entry and skill id exactly once", () => {
    const script = today();
    const ids = script.flatMap((l) => l.ids);
    const expected = new Set([
      ...content.entries.map((e) => e.id),
      ...content.skills.map((s) => s.id),
      ...content.education.map((e) => e.id),
      ...content.hobbies.map((h) => h.id),
    ]);
    for (const id of expected) {
      expect(
        ids.filter((x) => x === id),
        id,
      ).toHaveLength(1);
    }
    // Nothing is printed twice and nothing unknown is printed.
    expect(ids).toHaveLength(expected.size);
  });

  it("puts each record's label on the line that holds its id", () => {
    const script = today();
    for (const e of content.entries) {
      // competitive-programming is an entry and a hobby: one hobby line.
      const expected = hobbyIds.has(e.id)
        ? `${e.id}.service`
        : (e.bootLabel ?? e.title);
      expect(lineFor(script, e.id).text, e.id).toContain(expected);
    }
    for (const s of content.skills) {
      const { text, ids } = lineFor(script, s.id);
      if (s.category === "language") {
        expect(text).toBe(`Loaded ${s.name}`);
      } else {
        // A bare includes would match the skill named "C" anywhere.
        const names = text.slice(text.indexOf(": ") + 2).split(", ");
        expect(names, s.id).toContain(s.name);
        expect(names).toHaveLength(ids.length);
      }
    }
    for (const e of content.education) {
      expect(lineFor(script, e.id).text).toContain(e.school);
    }
    for (const h of content.hobbies) {
      expect(lineFor(script, h.id).text).toContain(`${h.id}.service`);
    }
  });

  it("shares one line between the three volunteer entries", () => {
    const script = today();
    const volunteers = content.entries.filter((e) => e.kind === "volunteer");
    expect(volunteers).toHaveLength(3);
    const lines = new Set(volunteers.map((e) => lineFor(script, e.id)));
    expect(lines.size).toBe(1);
    const [line] = [...lines];
    expect(line.text).toBe(
      "Started volunteer: Kortright Centre, TSS Concerts, Music Council",
    );
    expect(line.ids).toEqual([
      "kortright-volunteer",
      "thornhill-concerts",
      "music-council",
    ]);
  });

  it("follows Appendix B order", () => {
    const script = today();
    const groups = script
      .map((l) => l.group)
      .filter((g, i, all) => all.indexOf(g) === i);
    expect(groups).toEqual<BootGroup[]>([
      "flavour",
      "projects",
      "hackathons",
      "experience",
      "education",
      "languages",
      "skills",
      "hobbies",
      "summary",
    ]);

    const [first] = script;
    expect(first.text).toBe(staticContent.bootFlavour()[0]);
    expect(first.status).toBe("text");
    const last = script[script.length - 1];
    expect(last).toMatchObject({
      status: "ok",
      text: "Reached target BeselfOS Desktop",
    });

    // Every featured project comes before every other one.
    const featured = script
      .filter((l) => l.group === "projects" && l.status === "ok")
      .map((l) => entry(l.ids[0]).featured);
    expect(featured).toContain(true);
    expect(featured).toContain(false);
    expect(featured.lastIndexOf(true)).toBeLessThan(featured.indexOf(false));

    // Experience: the club, then the volunteers on one line.
    const experience = script.filter(
      (l) => l.group === "experience" && l.status === "ok",
    );
    expect(experience.map((l) => l.ids)).toEqual([
      ["thornhill-cs-club"],
      ["kortright-volunteer", "thornhill-concerts", "music-council"],
    ]);
  });

  it("builds the groups from bootGroups, not from the entry list", () => {
    const g = staticContent.bootGroups();
    const source = withGroups(() => ({ projects: g.projects.slice(0, 2) }));
    const ids = buildBootScript(source, OPTIONS)
      .filter((l) => l.group === "projects" && l.status === "ok")
      .map((l) => l.ids[0]);
    expect(ids).toEqual(g.projects.slice(0, 2).map((e) => e.id));
  });

  it("does not change the lists the provider returns", () => {
    const frozen = <T>(list: T[]): T[] => Object.freeze([...list]) as T[];
    const g = staticContent.bootGroups();
    const source = withGroups(() => ({
      projects: frozen(g.projects),
      hackathons: frozen(g.hackathons),
      experience: frozen(g.experience),
      education: frozen(g.education),
      languages: frozen(g.languages),
      skills: frozen(g.skills),
      hobbies: frozen(g.hobbies),
    }));
    // A sort or splice on a frozen list throws in strict mode.
    expect(buildBootScript(source, OPTIONS)).toEqual(today());
  });

  it("prints one header per non-empty group", () => {
    const headers = today().filter((l) => l.status === "header");
    expect(headers.map((l) => l.text)).toEqual([
      "Loading my projects...",
      "Loading hackathons...",
      "Loading experience...",
      "Loading education...",
      "Loading languages...",
      "Loading skills...",
      "Loading hobbies...",
    ]);

    const noHackathons = buildBootScript(
      withGroups(() => ({ hackathons: [] })),
      OPTIONS,
    );
    const texts = noHackathons.map((l) => l.text);
    expect(noHackathons.filter((l) => l.status === "header")).toHaveLength(6);
    expect(texts).not.toContain("Loading hackathons...");
    expect(noHackathons.some((l) => l.group === "hackathons")).toBe(false);
  });

  it("skips a skill category that has no skills", () => {
    const g = staticContent.bootGroups();
    const script = buildBootScript(
      withGroups(() => ({
        skills: g.skills.filter((s) => s.category !== "practice"),
      })),
      OPTIONS,
    );
    const texts = script.map((l) => l.text);
    expect(texts.some((t) => t.startsWith("Loaded tools: "))).toBe(true);
    expect(texts.some((t) => t.startsWith("Loaded practices"))).toBe(false);
  });

  it("writes the skill categories as one line each", () => {
    const lines = today().filter(
      (l) => l.group === "skills" && l.status === "ok",
    );
    expect(lines.map((l) => l.text.split(":")[0])).toEqual([
      "Loaded frameworks",
      "Loaded libraries",
      "Loaded tools",
      "Loaded practices",
    ]);
    expect(lines[0].text).toBe(
      "Loaded frameworks: React, Next.js, Express, Node.js, Unity, Remotion, PartyKit",
    );
  });

  it("writes years and verbs from the data", () => {
    const script = buildBootScript(staticContent, { ...OPTIONS, year: 2026 });
    const utm = lineFor(script, "utm").text;
    expect(utm.startsWith("Enrolled University of Toronto Mississauga")).toBe(
      true,
    );
    expect(utm.endsWith("(2024-2029)")).toBe(true);

    const ss = lineFor(script, "thornhill-ss").text;
    expect(ss).toContain("Graduated");
    expect(ss.endsWith("(2020-2024)")).toBe(true);

    // Its end is "present": the start year alone, never "2026-present".
    expect(lineFor(script, "bash-shell").text.endsWith("(2026)")).toBe(true);
    expect(
      lineFor(script, "thornhill-cs-club").text.endsWith("(2021-2024)"),
    ).toBe(true);
    expect(lineFor(script, "piano").text).toBe(
      "Started piano.service (since 2014)",
    );

    const later = buildBootScript(staticContent, { ...OPTIONS, year: 2030 });
    expect(lineFor(later, "utm").text.startsWith("Graduated ")).toBe(true);
  });

  it("drops the years when the start is unknown and keeps one year for one-year spans", () => {
    const base = entry("bash-shell");
    const source = withGroups(() => ({
      projects: [
        { ...base, id: "a", period: { start: "unknown" } },
        { ...base, id: "b", period: { start: "2024-03", end: "2024-12" } },
        { ...base, id: "c", period: { start: "2023-09", end: "2025-04" } },
      ],
    }));
    const script = buildBootScript(source, OPTIONS);
    const label = base.bootLabel ?? base.title;
    expect(lineFor(script, "a").text.endsWith(`  ${label}`)).toBe(true);
    expect(lineFor(script, "b").text.endsWith(`${label} (2024)`)).toBe(true);
    expect(lineFor(script, "c").text.endsWith(`${label} (2023-2025)`)).toBe(
      true,
    );
  });

  it("keeps the meaning of the flavour lines", () => {
    const script = today();
    const mounted = script.find((l) => l.text === "Mounted /home/beself");
    expect(mounted).toMatchObject({ status: "ok", group: "flavour", ids: [] });

    const kernel =
      "[    0.000000] Booting BeselfOS 2.0.0 on x86_64 (beselflan.github.io)";
    expect(script.find((l) => l.text === kernel)).toMatchObject({
      status: "text",
      group: "flavour",
    });

    const source: BootSource = {
      ...staticContent,
      bootFlavour: () => ["[ INFO ] a", "[ WARN ] b", "[ OK ] c", "plain"],
    };
    const flavour = buildBootScript(source, OPTIONS).filter(
      (l) => l.group === "flavour",
    );
    expect(flavour.map((l) => [l.status, l.text])).toEqual([
      ["info", "a"],
      ["warn", "b"],
      ["text", "[ OK ] c"],
      ["text", "plain"],
    ]);
  });

  it("writes the summary from the profile and the certifications", () => {
    const summary = today().filter((l) => l.group === "summary");
    expect(summary.map((l) => [l.status, l.text])).toEqual([
      [
        "info",
        "Certifications: Emergency First Aid with CPR-B, Bronze Cross, Bronze Medallion, Bronze Star",
      ],
      ["info", "Contact: beselflan@gmail.com  github.com/BeselfLan"],
      ["ok", "Reached target BeselfOS Desktop"],
    ]);

    const none = buildBootScript(
      { ...staticContent, certifications: () => [] },
      OPTIONS,
    );
    expect(none.some((l) => l.text.startsWith("Certifications"))).toBe(false);
  });

  it("prints no long numbers", () => {
    // D18: a phone number must never reach the log.
    for (const line of today()) expect(line.text).not.toMatch(/\d{7,}/);
  });

  it("lines the labels up in one column", () => {
    const script = today();
    const labelled = script.filter(
      (l) =>
        l.status === "ok" &&
        (l.group === "projects" ||
          l.group === "hackathons" ||
          l.ids[0] === "thornhill-cs-club"),
    );
    expect(labelled).toHaveLength(16 + 2 + 1);
    const column = (l: BootLine): number => {
      const e = entry(l.ids[0]);
      return l.text.lastIndexOf(e.bootLabel ?? e.title);
    };
    // The longest left part is "Mounted /projects/stock-change-predictor".
    for (const l of labelled) expect(column(l), l.text).toBe(42);
    for (const l of labelled) expect(l.text.slice(38, 42)).toMatch(/\s{2}$/);
  });

  it("widens the label column for a longer name", () => {
    const base = entry("pong");
    const long = "a-project-whose-name-is-much-longer-than-any-real-one";
    const source = withGroups((g) => ({
      projects: [{ ...base, id: long }, ...g.projects],
    }));
    const labelled = buildBootScript(source, OPTIONS).filter(
      (l) => l.status === "ok" && l.group === "projects",
    );
    const columns = labelled.map((l) => {
      const e = entry(l.ids[0] === long ? "pong" : l.ids[0]);
      return l.text.lastIndexOf(e.bootLabel ?? e.title);
    });
    expect(new Set(columns).size).toBe(1);
    expect(columns[0]).toBe(`Mounted /projects/${long}`.length + 2);
  });
});

describe("boot script year", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the year at call time", () => {
    // The module loaded under the real clock, so a year computed at load
    // would still say "Enrolled" here.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2040-06-01"));
    expect(lineFor(buildBootScript(staticContent), "utm").text).toMatch(
      /^Graduated /,
    );
    expect(
      lineFor(buildBootScript(staticContent, { year: 2026 }), "utm").text,
    ).toMatch(/^Enrolled /);
  });
});

/** A small seeded generator (mulberry32), so a run can be repeated. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0, 1, 0, 1, ... so the jitter differs from one line to the next. */
function alternating(): () => number {
  let n = 0;
  return () => n++ % 2;
}

function withManyProjects(count: number): BootSource {
  const base = entry("bash-shell");
  return withGroups((g) => ({
    projects: [
      ...g.projects,
      ...Array.from({ length: count }, (_, i) => ({ ...base, id: `p-${i}` })),
    ],
  }));
}

describe("boot script timing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lasts 2200 to 2600 ms for today's content", () => {
    const generators = {
      "all zero": () => 0,
      "nearly one": () => 0.999999,
      seeded: mulberry32(1),
    };
    for (const [name, random] of Object.entries(generators)) {
      const total = bootLogDuration(
        buildBootScript(staticContent, { random, year: 2026 }),
      );
      expect(total, name).toBeGreaterThanOrEqual(2200);
      expect(total, name).toBeLessThanOrEqual(2600);
      // The cap does not bite today: the whole budget is spent.
      expect(total, name).toBe(LOG_BUDGET_MS);
    }
  });

  it("gives a header line its pause", () => {
    // With no jitter to speak of, a line takes about 20 ms today.
    const script = buildBootScript(staticContent, OPTIONS);
    const headers = script.filter((l) => l.status === "header");
    const others = script.filter((l) => l.status !== "header");
    expect(headers).toHaveLength(7);
    for (const l of others) expect(l.delayMs).toBeLessThanOrEqual(21);
    for (const l of headers) {
      expect(l.delayMs, l.text).toBeGreaterThanOrEqual(HEADER_PAUSE_MS + 19);
    }
  });

  it("moves time between lines but keeps the total", () => {
    const jittered = buildBootScript(staticContent, {
      random: alternating(),
      year: 2026,
    });
    const flat = buildBootScript(staticContent, OPTIONS);

    const delays = jittered
      .filter((l) => l.status !== "header")
      .map((l) => l.delayMs);
    // Not all equal, and by more than rounding.
    expect(Math.max(...delays) - Math.min(...delays)).toBeGreaterThanOrEqual(8);
    expect(
      Math.abs(bootLogDuration(jittered) - bootLogDuration(flat)),
    ).toBeLessThanOrEqual(1);
  });

  it("calls random once per line, in order", () => {
    const calls: number[] = [];
    const script = buildBootScript(staticContent, {
      random: () => {
        calls.push(calls.length);
        return 0.5;
      },
      year: 2026,
    });
    expect(script).toHaveLength(57);
    expect(calls).toHaveLength(57);

    // The first line's jitter is the first value, so the order is the line order.
    const first = buildBootScript(staticContent, {
      random: (() => {
        let n = 0;
        return () => (n++ === 0 ? 1 : 0.5);
      })(),
      year: 2026,
    });
    expect(first[0].delayMs).toBeGreaterThan(
      buildBootScript(staticContent, OPTIONS)[0].delayMs,
    );
  });

  it("holds the cap for any amount of content", () => {
    const script = buildBootScript(withManyProjects(300), {
      random: mulberry32(7),
      year: 2026,
    });
    expect(script.filter((l) => l.ids[0]?.startsWith("p-"))).toHaveLength(300);
    // The 18 ms floor alone would give about 7.5 s.
    expect(bootLogDuration(script)).toBeLessThanOrEqual(LOG_MAX_MS);
    expect(bootLogDuration(script)).toBeGreaterThan(LOG_BUDGET_MS);
    for (const l of script) expect(l.delayMs).toBeGreaterThanOrEqual(0);
  });

  it("makes the delays whole and adds them up", () => {
    const sources = [staticContent, withManyProjects(300)];
    for (const source of sources) {
      for (const random of [() => 0, alternating(), mulberry32(3)]) {
        const script = buildBootScript(source, { random, year: 2026 });
        for (const l of script) {
          expect(Number.isInteger(l.delayMs), l.text).toBe(true);
          expect(l.delayMs, l.text).toBeGreaterThanOrEqual(0);
        }
        const sum = script.reduce((total, l) => total + l.delayMs, 0);
        expect(sum).toBe(bootLogDuration(script));
        expect(sum).toBeLessThanOrEqual(LOG_MAX_MS);
      }
    }
  });

  it("is zero for a log with no lines", () => {
    expect(bootLogDuration([])).toBe(0);
  });
});

describe("boot script randomness and clock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("calls neither Math.random nor the clock outside the call", async () => {
    vi.resetModules();
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");
    const date = vi.spyOn(globalThis, "Date");

    const fresh = await import("./bootScript");
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(date).not.toHaveBeenCalled();

    // With both options given, the call needs neither default.
    fresh.buildBootScript(staticContent, { random: () => 0.5, year: 2026 });
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(date).not.toHaveBeenCalled();
  });

  it("uses Math.random for the jitter when none is given", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    buildBootScript(staticContent, { year: 2026 });
    expect(random).toHaveBeenCalledTimes(57);
  });
});
