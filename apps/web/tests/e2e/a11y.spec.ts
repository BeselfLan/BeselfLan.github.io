import { expect, test, type Page } from "@playwright/test";
import { axeFindings, expectNoSeriousAxe } from "./axe";

// The accessibility of the whole site at 1440x900 (#24, #149), the last of
// #24's five children. #145 to #148 made the fixes and scanned their own
// surfaces, each limited to one; this file does what no scoped scan can:
//
// - axe over the whole page, so the page-level rules run (`html-has-lang`,
//   `document-title`, `bypass`), ids that clash across surfaces are found, and
//   the screen's portal and every surface are in one scan;
// - proof that axe measured the panels' text contrast;
// - keyboard-only journeys across apps, with no click in them;
// - nothing moving under reduced motion, and a control showing that the probe
//   does see motion when it is allowed.
//
// The laptop is scaled at this viewport (about 0.92, not 1), so nothing here
// measures a box. The phone's checks are in mobile.spec.ts.

test.setTimeout(90_000); // The first request compiles the route.
test.use({ viewport: { width: 1440, height: 900 } });

// A console error or a page error fails the test. motion's warning about
// reduced motion is a `warn`, so it is not collected.
const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

/**
 * Loads `path` and waits for the desktop. A deep link (`/?app=...`) fast-boots,
 * and so does `?boot=skip`. Unless `welcome` is set the session starts out
 * welcomed, through an init script that runs before the page's own scripts and
 * again on every later load of this page.
 */
async function openDesktop(
  page: Page,
  { path = "/?boot=skip", welcome = false } = {},
) {
  if (!welcome) {
    await page.addInitScript(() =>
      sessionStorage.setItem("beselfos:welcomed", "1"),
    );
  }
  await page.goto(path);
  await expect(page.locator("[data-desktop]")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-boot-stage]")).toHaveCount(0, {
    timeout: 5_000,
  });
}

const frame = (page: Page, id: string) =>
  page.locator(`[data-window-id="${id}"]`);
const surface = (page: Page, id: string) =>
  frame(page, id).locator(":scope > div");

/**
 * The window has finished fading in. axe reads a fading element at its current
 * opacity and reports a false colour-contrast failure for it (#145), so every
 * scan waits for this first.
 */
async function settled(page: Page, id: string) {
  await expect(surface(page, id)).toHaveCSS("opacity", "1");
}

const play = (page: Page) =>
  page
    .locator("[data-detail-panel]")
    .getByRole("button", { name: "Play demo", exact: true });

/** Projects with Deadknight's panel, once the Play button knows its answer. */
async function openDeadknight(page: Page) {
  await page.goto("/?app=projects&item=deadknight");
  await expect(play(page)).toHaveAttribute("data-media", "ready", {
    timeout: 15_000,
  });
  await settled(page, "projects");
}

// Test 1. Every call is a whole-page scan: no `include`, so axe runs the
// page-level rules on `document`. Reduced motion, so nothing is caught
// mid-fade; the colours are the same either way.
test.describe("the desktop and every app pass axe, whole page", () => {
  test.use({ reducedMotion: "reduce" });

  test("the desktop, the welcome and the App Grid", async ({ page }) => {
    await openDesktop(page, { welcome: true });
    await expect(page.locator("[data-toast]")).toBeVisible();
    await expectNoSeriousAxe(page, "desktop with the welcome");
    // The scan covered the toast: it has not left yet.
    await expect(page.locator("[data-toast]")).toHaveCount(1);

    await page.getByRole("button", { name: "Activities" }).click();
    await expect(
      page.getByRole("searchbox", { name: "Search apps" }),
    ).toBeFocused();
    await expectNoSeriousAxe(page, "App Grid");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-app-grid]")).toBeHidden();
  });

  test("Projects, its panel and the demo window", async ({ page }) => {
    await openDesktop(page, { path: "/?app=projects" });
    await expect(page.locator("[data-entry-id]").first()).toBeVisible({
      timeout: 15_000,
    });
    await settled(page, "projects");
    await expectNoSeriousAxe(page, "Projects");

    await openDeadknight(page);
    await expectNoSeriousAxe(page, "Projects with deadknight's panel");

    await play(page).click();
    const demo = frame(page, "video-player:deadknight");
    await expect(demo.locator('[data-video-state="ready"]')).toBeVisible({
      timeout: 15_000,
    });
    await settled(page, "video-player:deadknight");
    await expectNoSeriousAxe(page, "the demo window");

    // One video at a time: the host is short on memory.
    await demo.getByRole("button", { name: "Close", exact: true }).click();
    await expect(demo).toHaveCount(0);
  });

  test("Skills: the list, the stage and Python's panel", async ({ page }) => {
    await openDesktop(page, { path: "/?app=skills" });
    // The list is the default under reduced motion.
    const toggle = frame(page, "skills").getByRole("button", {
      name: "List view",
      exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-skill-card]").first()).toBeVisible();
    await settled(page, "skills");
    await expectNoSeriousAxe(page, "Skills list view");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("[data-skill-id]").first()).toBeVisible();
    await expectNoSeriousAxe(page, "Skills stage");

    await page.goto("/?app=skills&item=python");
    await frame(page, "skills")
      .getByRole("button", { name: "List view", exact: true })
      .click();
    await expect(
      page.locator("[data-skill-panel]").getByRole("heading", {
        name: "Python",
        level: 3,
      }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-skill-id]").first()).toBeVisible();
    await settled(page, "skills");
    await expectNoSeriousAxe(page, "Skills with Python's panel");
  });

  test("About and Hello", async ({ page }) => {
    await openDesktop(page, { path: "/?app=about" });
    await expect(page.locator("[data-about]")).toBeVisible({ timeout: 15_000 });
    await settled(page, "about");
    await expectNoSeriousAxe(page, "About");

    await page.goto("/?app=hello");
    await expect(
      frame(page, "hello").getByRole("heading", { name: "Hello, world" }),
    ).toBeVisible({ timeout: 15_000 });
    await settled(page, "hello");
    await expectNoSeriousAxe(page, "Hello");
  });

  // #24: "panel text contrast is at least 4.5:1". A rule that did not run proves
  // nothing, so this asks axe which rules passed. It scans the panel and not the
  // page, so a pass somewhere else on the page cannot stand in for the panel.
  //
  // This is red until #156 is fixed: Screen's empty full-screen portal layer
  // makes axe report every window's text as `incomplete` (bgOverlap), so
  // `color-contrast` never reaches `passes`. Do not skip or loosen it; it goes
  // green with no change here once the portal has no box.
  test("axe measured the panel text", async ({ page }) => {
    await openDesktop(page);
    await openDeadknight(page);
    const projects = await axeFindings(page, {
      include: ["[data-detail-panel]"],
    });
    expect(projects.passes, "Projects' panel").toContain("color-contrast");
    expect(projects.findings, "Projects' panel").toEqual([]);

    // Under reduced motion this is the list, with the panel beside it.
    await page.goto("/?app=skills&item=python");
    await expect(page.locator("[data-skill-panel]")).toBeVisible({
      timeout: 15_000,
    });
    await settled(page, "skills");
    const skills = await axeFindings(page, {
      include: ["[data-skill-panel]"],
    });
    expect(skills.passes, "Skills' panel").toContain("color-contrast");
    expect(skills.findings, "Skills' panel").toEqual([]);
  });
});
