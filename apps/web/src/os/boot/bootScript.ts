// The boot log as data (plan 3.3, Appendix B).
//
// `buildBootScript` turns the content provider into one `BootLine` per log
// line: the flavour lines, then one group per kind of record, each with a
// header, then the summary. It is pure: no React, no DOM, no store. Every
// string comes from the content package, so a phone number can never get in
// (D18); nothing here reads `info.txt`.
//
// Call it from a client effect, never at module scope and never during render
// (plan 9). The year and the jitter come from the clock and `Math.random`, and
// the server render and the first client render would disagree. Both are read
// only inside the call.

import type { Skill, SkillCategory } from "@beself/content";
import type { ContentProvider } from "@/content/provider";

// Timing (plan 3.3, #73). The header pauses count inside the budget. Read
// literally, plan 3.3 puts 150 ms per header on top of 2200 ms, which is about
// 3250 ms today and breaks its own "~2.2-2.6 s" and the Phase 3 bound of
// 2600 ms. The cost is lines of about 20 ms, not Appendix B's estimate of
// about 40 ms. Override: change the constants but keep LOG_MAX_MS at 2600 or
// less. HEADER_PAUSE_MS = 50 gives lines of about 32 ms at the same total.

/** Total time of today's log, header pauses included. */
export const LOG_BUDGET_MS = 2200;
/** Extra wait on a group header line. */
export const HEADER_PAUSE_MS = 150;
/** Least average time per line, so a long log stays readable. */
export const LINE_MIN_MS = 18;
/** Most average time per line, so a short log is not slow. */
export const LINE_MAX_MS = 60;
/** How far one line may stray from the average: +/- 30 percent. */
export const JITTER = 0.3;
/** The log never lasts longer than this, whatever the amount of content. */
export const LOG_MAX_MS = 2600;

export type BootStatus = "ok" | "info" | "warn" | "header" | "text";

export type BootGroup =
  | "flavour"
  | "projects"
  | "hackathons"
  | "experience"
  | "education"
  | "languages"
  | "skills"
  | "hobbies"
  | "summary";

export interface BootLine {
  /** Without the status column. */
  text: string;
  status: BootStatus;
  group: BootGroup;
  /** Whole milliseconds to wait before this line prints. */
  delayMs: number;
  /** Content ids this line reports. */
  ids: readonly string[];
}

export type BootSource = Pick<
  ContentProvider,
  "bootGroups" | "bootFlavour" | "profile" | "certifications"
>;

/**
 * What goes between the brackets of the status column. The flavour parser
 * matches `[${label}] ` and the boot screen renders `[${label}]`, so both
 * read this one table.
 */
export const STATUS_LABEL = {
  ok: "  OK  ",
  info: " INFO ",
  warn: " WARN ",
} as const;

/** One header per group that has records. Flavour and summary have none. */
const HEADERS: Readonly<Partial<Record<BootGroup, string>>> = {
  projects: "Loading my projects...",
  hackathons: "Loading hackathons...",
  experience: "Loading experience...",
  education: "Loading education...",
  languages: "Loading languages...",
  skills: "Loading skills...",
  hobbies: "Loading hobbies...",
};

/** How a skill category reads in "Loaded <category>: ...". */
const CATEGORY_PLURAL: Readonly<Record<SkillCategory, string>> = {
  language: "languages",
  framework: "frameworks",
  library: "libraries",
  tool: "tools",
  practice: "practices",
};

/**
 * A line before layout. A `left` and `right` pair is padded so the right
 * parts start in one column; a line with plain `text` is printed as it is.
 */
type Draft = Omit<BootLine, "text" | "delayMs"> &
  ({ text: string } | { left: string; right: string });

interface Dated {
  start: string;
  end?: string;
}

const yearOf = (date: string): string => date.slice(0, 4);

/**
 * "2024-2029", or just "2026" when there is no end, the end is "present" or
 * the end is in the start year. Null when the start is "unknown".
 */
function years(period: Dated): string | null {
  if (period.start === "unknown") return null;
  const start = yearOf(period.start);
  if (period.end === undefined || period.end === "present") return start;
  const end = yearOf(period.end);
  return end === start ? start : `${start}-${end}`;
}

function withYears(label: string, period: Dated): string {
  const y = years(period);
  return y === null ? label : `${label} (${y})`;
}

function educationVerb(end: string | undefined, year: number): string {
  if (end === undefined || end === "present") return "Enrolled";
  return Number(yearOf(end)) > year ? "Enrolled" : "Graduated";
}

const FLAVOUR_PREFIXES = (
  Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]
).map((status) => ({ status, prefix: `[${STATUS_LABEL[status]}] ` }));

/** "[  OK  ] Mounted ..." gets status ok. Anything else prints as it is. */
function flavourDraft(raw: string): Draft {
  for (const { status, prefix } of FLAVOUR_PREFIXES) {
    if (raw.startsWith(prefix)) {
      return {
        status,
        group: "flavour",
        ids: [],
        text: raw.slice(prefix.length),
      };
    }
  }
  return { status: "text", group: "flavour", ids: [], text: raw };
}

/** Puts the group's header in front of its lines, unless it has none. */
function section(group: BootGroup, lines: readonly Draft[]): Draft[] {
  const title = HEADERS[group];
  if (lines.length === 0 || title === undefined) return [...lines];
  return [{ status: "header", group, ids: [], text: title }, ...lines];
}

const service = (id: string): string => `Started ${id}.service`;

/**
 * Whole-millisecond delays for the lines, in order.
 *
 * 1. The average is the budget minus the header pauses, spread over every
 *    line, held between LINE_MIN_MS and LINE_MAX_MS.
 * 2. Each line gets the average times a jitter. The jitters are rescaled so
 *    they sum to the average times the line count: jitter moves time between
 *    lines but never changes the total.
 * 3. A header line adds HEADER_PAUSE_MS.
 * 4. If the sum is over LOG_MAX_MS, every value is scaled down to fit. This
 *    is what holds the cap when the floor of step 1 would not.
 * 5. Delays are differences of rounded running totals. Rounding each delay on
 *    its own would drift by tens of milliseconds over a long log.
 *
 * `random` is called once per line, in order, headers included. It is used
 * only in the formula, so a value of 1 is fine.
 */
function timeLines(drafts: readonly Draft[], random: () => number): number[] {
  const lines = drafts.length;
  if (lines === 0) return [];
  const headers = drafts.filter((d) => d.status === "header").length;
  const average = Math.min(
    LINE_MAX_MS,
    Math.max(LINE_MIN_MS, (LOG_BUDGET_MS - HEADER_PAUSE_MS * headers) / lines),
  );

  const raw = drafts.map((d) => ({
    pause: d.status === "header" ? HEADER_PAUSE_MS : 0,
    ms: average * (1 + JITTER * (2 * random() - 1)),
  }));
  const rawTotal = raw.reduce((sum, r) => sum + r.ms, 0);
  const weights = raw.map((r) => (r.ms * average * lines) / rawTotal + r.pause);

  const total = weights.reduce((sum, w) => sum + w, 0);
  const fit = total > LOG_MAX_MS ? LOG_MAX_MS / total : 1;

  let elapsed = 0;
  let printed = 0;
  return weights.map((w) => {
    elapsed += w * fit;
    const at = Math.round(elapsed);
    const delay = at - printed;
    printed = at;
    return delay;
  });
}

/**
 * Builds the boot log. `options.random` and `options.year` exist for tests;
 * the defaults are `Math.random` and the current year, read inside the call.
 * It never changes what the provider returns: `bootGroups()` is one shared
 * object, so every list here is a new array.
 */
export function buildBootScript(
  source: BootSource,
  options: { random?: () => number; year?: number } = {},
): BootLine[] {
  const year = options.year ?? new Date().getFullYear();
  const groups = source.bootGroups();
  const profile = source.profile();
  const certifications = source.certifications();

  const flavour = source.bootFlavour().map(flavourDraft);

  const projects = groups.projects.map((e): Draft => ({
    status: "ok",
    group: "projects",
    ids: [e.id],
    left: `Mounted /projects/${e.id}`,
    right: withYears(e.bootLabel ?? e.title, e.period),
  }));

  const hackathons = groups.hackathons.map((e): Draft => ({
    status: "ok",
    group: "hackathons",
    ids: [e.id],
    left: service(e.id),
    right: withYears(e.bootLabel ?? e.title, e.period),
  }));

  const volunteers = groups.experience.filter((e) => e.kind === "volunteer");
  const experience: Draft[] = groups.experience
    .filter((e) => e.kind !== "volunteer")
    .map((e): Draft => ({
      status: "ok",
      group: "experience",
      ids: [e.id],
      left: service(e.id),
      right: withYears(e.bootLabel ?? e.title, e.period),
    }));
  if (volunteers.length > 0) {
    const labels = volunteers.map((e) => e.bootLabel ?? e.title);
    experience.push({
      status: "ok",
      group: "experience",
      ids: volunteers.map((e) => e.id),
      text: `Started volunteer: ${labels.join(", ")}`,
    });
  }

  const education = groups.education.map((e): Draft => ({
    status: "ok",
    group: "education",
    ids: [e.id],
    text: `${educationVerb(e.period.end, year)} ${e.school} -- ${withYears(e.program, e.period)}`,
  }));

  const languages = groups.languages.map((s): Draft => ({
    status: "ok",
    group: "languages",
    ids: [s.id],
    text: `Loaded ${s.name}`,
  }));

  // One line per category, in the order bootGroups() lists them.
  const byCategory = new Map<SkillCategory, Skill[]>();
  for (const s of groups.skills) {
    byCategory.set(s.category, [...(byCategory.get(s.category) ?? []), s]);
  }
  const skills = [...byCategory].map(([category, list]): Draft => ({
    status: "ok",
    group: "skills",
    ids: list.map((s) => s.id),
    text: `Loaded ${CATEGORY_PLURAL[category]}: ${list.map((s) => s.name).join(", ")}`,
  }));

  const hobbies = groups.hobbies.map((h): Draft => ({
    status: "ok",
    group: "hobbies",
    ids: [h.id],
    text: `${service(h.id)} (since ${yearOf(h.period.start)})`,
  }));

  const summary: Draft[] = [];
  if (certifications.length > 0) {
    summary.push({
      status: "info",
      group: "summary",
      ids: [],
      text: `Certifications: ${certifications.map((c) => c.name).join(", ")}`,
    });
  }
  summary.push(
    {
      status: "info",
      group: "summary",
      ids: [],
      text: `Contact: ${profile.email}  ${profile.github.replace(/^https?:\/\//, "")}`,
    },
    {
      status: "ok",
      group: "summary",
      ids: [],
      text: "Reached target BeselfOS Desktop",
    },
  );

  const drafts: Draft[] = [
    ...flavour,
    ...section("projects", projects),
    ...section("hackathons", hackathons),
    ...section("experience", experience),
    ...section("education", education),
    ...section("languages", languages),
    ...section("skills", skills),
    ...section("hobbies", hobbies),
    ...summary,
  ];

  // Right parts start in one column: the longest left part plus 2 spaces.
  const width =
    drafts.reduce((w, d) => ("left" in d ? Math.max(w, d.left.length) : w), 0) +
    2;

  const delays = timeLines(drafts, options.random ?? Math.random);

  return drafts.map((d, i): BootLine => ({
    text: "left" in d ? d.left.padEnd(width) + d.right : d.text,
    status: d.status,
    group: d.group,
    delayMs: delays[i],
    ids: d.ids,
  }));
}

/** The time the whole log takes: the sum of its delays, in ms. */
export function bootLogDuration(script: readonly BootLine[]): number {
  return script.reduce((total, line) => total + line.delayMs, 0);
}
