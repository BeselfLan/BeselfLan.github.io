import { expect, type Page } from "@playwright/test";
import axe from "axe-core";

// The shared accessibility check for the e2e specs (#24): axe's own engine,
// run in the page, reduced to the findings that fail a test. It is not a spec,
// so Playwright's default testMatch skips it. #146 to #149 import
// `axeFindings` and `expectNoSeriousAxe` by these names.
//
// It has no waits and no retries. Callers wait for their own state first,
// including any enter fade: a fading element is scanned at its current
// opacity, and axe reports a false colour-contrast failure for it.
//
// Scans run at 1440x900 (scale 1) or 390x844, so the laptop's CSS scale never
// shrinks a target. The rules are axe's defaults: `target-size` stays off, as
// axe 4.14 ships it.

declare global {
  interface Window {
    axe: typeof axe;
  }
}

/** CSS selectors. `include` limits the scan, and `exclude` takes parts out of it. */
export interface AxeScope {
  include?: string[];
  exclude?: string[];
}

export interface AxeFinding {
  id: string;
  impact: "serious" | "critical";
  help: string;
  /** At most 5 selectors of the elements that broke the rule. */
  targets: string[];
}

export interface AxeReport {
  /** The violations whose impact is serious or critical. */
  findings: AxeFinding[];
  /** The ids of the rules that passed. */
  passes: string[];
}

/** Injects axe once per document, then runs it on the document or on `scope`. */
export async function axeFindings(
  page: Page,
  scope?: AxeScope,
): Promise<AxeReport> {
  // A navigation brings a new document with no axe in it.
  if (!(await page.evaluate(() => "axe" in window))) {
    await page.addScriptTag({ content: axe.source });
  }
  // This runs in the page, so it reads `window.axe`, not the import. A selector
  // that matches nothing makes axe throw, so a wrong one fails the test.
  return page.evaluate(async (scope) => {
    const context = scope?.include
      ? {
          include: scope.include.map((selector) => [selector]),
          exclude: (scope.exclude ?? []).map((selector) => [selector]),
        }
      : document;
    const results = await window.axe.run(context, {
      resultTypes: ["violations"],
    });
    return {
      findings: results.violations.flatMap((violation) =>
        violation.impact === "serious" || violation.impact === "critical"
          ? [
              {
                id: violation.id,
                impact: violation.impact,
                help: violation.help,
                targets: violation.nodes
                  .slice(0, 5)
                  .map((node) => node.target.join(" ")),
              },
            ]
          : [],
      ),
      passes: results.passes.map((rule) => rule.id),
    };
  }, scope);
}

/** Fails with every serious or critical rule, its help text and its targets. */
export async function expectNoSeriousAxe(
  page: Page,
  label: string,
  scope?: AxeScope,
): Promise<void> {
  const { findings } = await axeFindings(page, scope);
  expect(findings, label).toEqual([]);
}
