import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { staticContent } from "@/content/static";
import { BootLog, newestHeader } from "./BootLog";
import {
  buildBootScript,
  STATUS_LABEL,
  type BootLine,
  type BootStatus,
} from "./bootScript";

const line = (
  status: BootStatus,
  text: string,
  group: BootLine["group"] = "flavour",
): BootLine => ({ text, status, group, delayMs: 0, ids: [] });

const lineEls = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>("[data-boot-line]"),
];

/** What the screen shows for a line: the status column, then the text. */
function expected(l: BootLine): string {
  return l.status === "ok" || l.status === "info" || l.status === "warn"
    ? `[${STATUS_LABEL[l.status]}] ${l.text}`
    : l.text;
}

describe("BootLog", () => {
  it("renders the status column", () => {
    const { container } = render(
      <BootLog
        lines={[
          line("ok", "x"),
          line("info", "x"),
          line("warn", "x"),
          line("header", "Loading x..."),
          line("text", "kernel flavour"),
        ]}
      />,
    );
    const els = lineEls(container);
    expect(els.map((e) => e.textContent)).toEqual([
      "[  OK  ] x",
      "[ INFO ] x",
      "[ WARN ] x",
      "Loading x...",
      "kernel flavour",
    ]);
    expect(els.map((e) => e.getAttribute("data-status"))).toEqual([
      "ok",
      "info",
      "warn",
      "header",
      "text",
    ]);
  });

  it("colours the label and nothing else, and bolds only headers", () => {
    const { container } = render(
      <BootLog
        lines={[
          line("ok", "x"),
          line("info", "x"),
          line("warn", "x"),
          line("header", "h"),
          line("text", "t"),
        ]}
      />,
    );
    const [ok, info, warn, header, text] = lineEls(container);
    const label = (el: HTMLElement) => el.querySelector("span");
    expect(label(ok)?.textContent).toBe("  OK  ");
    expect(label(ok)?.className).toContain("text-green-400");
    expect(label(info)?.textContent).toBe(" INFO ");
    expect(label(info)?.className).toContain("text-cyan-400");
    expect(label(warn)?.textContent).toBe(" WARN ");
    expect(label(warn)?.className).toContain("text-yellow-300");
    expect(header.className).toContain("font-bold");
    expect(text.className).not.toContain("font-bold");
    // Header and text lines have no status column to colour.
    expect(header.querySelector("span")).toBeNull();
    expect(text.querySelector("span")).toBeNull();
  });

  it("prints every line whole", () => {
    const script = buildBootScript(staticContent, { random: () => 0.5 });
    const { container } = render(<BootLog lines={script} />);
    const els = lineEls(container);
    expect(els).toHaveLength(script.length);
    script.forEach((l, i) => {
      expect(els[i].textContent, `line ${i}`).toBe(expected(l));
    });

    // The longest line is not cut and not trimmed.
    const longest = script.reduce((a, b) =>
      b.text.length > a.text.length ? b : a,
    );
    expect(longest.text.length).toBeGreaterThan(150);
    expect(els[script.indexOf(longest)].textContent).toBe(expected(longest));

    // A project line keeps its padding: several spaces, not collapsed to one.
    const project = script.findIndex(
      (l) => l.group === "projects" && l.status === "ok",
    );
    expect(project).toBeGreaterThan(-1);
    expect(els[project].textContent).toMatch(
      /^\[ {2}OK {2}\] Mounted \/projects\/\S+ {2,}\S/,
    );
  });

  it("the visual log is hidden from screen readers", () => {
    const { container } = render(<BootLog lines={[line("ok", "x")]} />);
    const log = container.querySelector("[data-boot-log]");
    expect(log?.getAttribute("aria-hidden")).toBe("true");
    expect(log?.hasAttribute("role")).toBe(false);
    expect(log?.hasAttribute("aria-live")).toBe(false);
    expect(container.querySelector("[aria-live], [role]")).toBeNull();
  });

  it("is an empty log before the first line", () => {
    const { container } = render(<BootLog lines={[]} />);
    expect(container.querySelector("[data-boot-log]")).not.toBeNull();
    expect(lineEls(container)).toHaveLength(0);
  });
});

describe("newestHeader", () => {
  const header = (text: string) => line("header", text, "projects");

  it("is empty when no header has printed", () => {
    expect(newestHeader([])).toBe("");
    expect(newestHeader([line("ok", "a"), line("text", "b")])).toBe("");
  });

  it("is the header's text after one", () => {
    expect(
      newestHeader([
        line("text", "a"),
        header("Loading a..."),
        line("ok", "b"),
      ]),
    ).toBe("Loading a...");
  });

  it("is the last header when there are several", () => {
    expect(
      newestHeader([
        header("Loading a..."),
        line("ok", "x"),
        header("Loading b..."),
        line("ok", "y"),
      ]),
    ).toBe("Loading b...");
  });
});
