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
const dockIcon = (page: Page, id: string) =>
  page.locator(`[data-dock-app="${id}"]`);
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

// The keyboard journeys. Each one uses real keys and no click, so it fails if
// a surface cannot be reached, or if focus is left behind. Motion is allowed
// here, so Skills opens on its stage.

const blurActive = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

// The window that holds keyboard focus, or null.
const focusedWindowId = (page: Page) =>
  page.evaluate(
    () =>
      document.activeElement
        ?.closest("[data-window-id]")
        ?.getAttribute("data-window-id") ?? null,
  );

/** A CSS selector, or an accessible name (the `aria-label`, else the text). */
type Match = string | { name: string };

/**
 * Presses `key` until the focused element matches, at most `max` times, and
 * gives the number of presses. It fails with the count and the focused
 * element, cut to 120 characters, so a journey that took a wrong turn shows
 * where it stopped. It reads the page, not a locator: a locator waits for an
 * element that may not exist yet.
 */
async function pressUntil(page: Page, key: string, match: Match, max: number) {
  for (let presses = 1; presses <= max; presses++) {
    await page.keyboard.press(key);
    const hit = await page.evaluate((m) => {
      const el = document.activeElement;
      if (!el) return false;
      return typeof m === "string"
        ? el.matches(m)
        : (el.getAttribute("aria-label") ?? el.textContent?.trim()) === m.name;
    }, match);
    if (hit) return presses;
  }
  const active = await page.evaluate(
    () => document.activeElement?.outerHTML.slice(0, 120) ?? "nothing",
  );
  throw new Error(
    `${key} x${max} did not reach ${JSON.stringify(match)}; focus is on ${active}`,
  );
}

test("keyboard only: the App Grid, Skills, and closing", async ({ page }) => {
  await openDesktop(page);
  await blurActive(page);

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Activities", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("searchbox", { name: "Search apps" }),
  ).toBeFocused();

  // The grid launches Skills, and focus goes into it, not back to Activities.
  await page.keyboard.type("ski");
  await page.keyboard.press("Enter");
  await expect(frame(page, "skills")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => focusedWindowId(page)).toBe("skills");

  // Tab to an icon, which has the stage's one Tab stop. Enter opens its panel,
  // and Escape closes it with focus back on the icon.
  await expect(page.locator("[data-skill-id]").first()).toBeVisible();
  await pressUntil(page, "Tab", "[data-skill-id]", 40);
  const id = await page.evaluate(
    () => document.activeElement?.getAttribute("data-skill-id") ?? "",
  );
  expect(id).not.toBe("");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-skill-panel]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-skill-panel]")).toHaveCount(0);
  await expect(page.locator(`[data-skill-id="${id}"]`)).toBeFocused();

  // "List view" is the control just before the stage, so Shift+Tab reaches it
  // at once. Tab forward would go round the whole desktop first.
  await pressUntil(page, "Shift+Tab", { name: "List view" }, 5);
  await expect(
    frame(page, "skills").getByRole("button", { name: "List view" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-skill-card]").first()).toBeVisible();
  await expect(page.locator("[data-skill-id]")).toHaveCount(0);

  // Alt+F4 closes the focused window, and focus lands on its dock icon.
  await page.keyboard.press("Alt+F4");
  await expect(frame(page, "skills")).toHaveCount(0);
  await expect(dockIcon(page, "skills")).toBeFocused();
});

test("keyboard only: the dock, Projects, Play and Alt+Tab", async ({
  page,
}) => {
  await openDesktop(page);
  await blurActive(page);

  await pressUntil(page, "Tab", '[data-dock-app="projects"]', 20);
  await page.keyboard.press("Enter");
  await expect(frame(page, "projects")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => focusedWindowId(page)).toBe("projects");

  // The ring: its front item is the one Tab stop, and ArrowRight turns it.
  await expect(page.locator("[data-entry-id]").first()).toBeVisible();
  await pressUntil(page, "Tab", "[data-carousel] [data-front]", 20);
  const index = page.locator("[data-carousel-index]");
  const before = await index.textContent();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => index.textContent()).not.toBe(before);

  // Only an entry with a video has Play, and the first Featured ones have none.
  // Focus follows the arrow key to the item it sends the ring to.
  const deadknight = page.locator('[data-entry-id="deadknight"]');
  for (let i = 0; i < 13; i++) {
    if (await deadknight.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("ArrowRight");
  }
  await expect(deadknight).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-detail-panel]")).toBeVisible();

  // Tab to Play once its answer is in, and Enter opens the demo window.
  await expect(play(page)).toHaveAttribute("data-media", "ready", {
    timeout: 15_000,
  });
  await pressUntil(page, "Tab", "[data-detail-panel] [data-media]", 30);
  await page.keyboard.press("Enter");
  const demo = frame(page, "video-player:deadknight");
  await expect(demo).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => focusedWindowId(page))
    .toBe("video-player:deadknight");

  // Chromium sends the page no keys while focus is inside a video's native
  // controls (#102), so Alt+Tab below would be lost.
  expect(
    await page.evaluate(() => document.activeElement?.tagName),
    "focus is on the video",
  ).not.toBe("VIDEO");

  // Alt+Tab goes back to Projects, with focus inside it.
  await page.keyboard.down("Alt");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Alt");
  await expect(frame(page, "projects")).toHaveAttribute("data-focused", "");
  await expect.poll(() => focusedWindowId(page)).toBe("projects");

  // Escape closes the panel, and focus is back on the ring's front item.
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-detail-panel]")).toHaveCount(0);
  await expect(page.locator("[data-carousel] [data-front]")).toBeFocused();

  // One video at a time: the host is short on memory. Projects is in front of
  // the player now, so Close is pressed from the keyboard, not clicked.
  await demo.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(demo).toHaveCount(0);
});

test("keyboard only: the top bar and the menus", async ({ page }) => {
  await openDesktop(page);
  await blurActive(page);

  // The clock opens the calendar, and Escape gives focus back to it.
  await pressUntil(page, "Tab", "[data-clock]", 5);
  await page.keyboard.press("Enter");
  const calendar = page.getByRole("dialog", {
    name: "Calendar and notifications",
  });
  await expect(calendar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(page.locator("[data-clock]")).toBeFocused();

  // The System menu: Enter opens it on its first item, ArrowDown moves on, and
  // Escape gives focus back. Its name is "System menu, battery 87%".
  await pressUntil(page, "Tab", '[aria-label^="System menu"]', 5);
  const systemButton = page.getByRole("button", { name: "System menu" });
  await expect(systemButton).toBeFocused();
  await page.keyboard.press("Enter");
  const system = page.getByRole("dialog", { name: "System menu" });
  await expect(system).toBeVisible();
  await expect(
    system.getByRole("menuitem", { name: "Settings" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(system.getByRole("menuitem", { name: "Lock" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(system).toHaveCount(0);
  await expect(systemButton).toBeFocused();

  // A dock icon's menu, which gives focus back to the icon.
  const contextMenu = page.getByRole("menu", { name: "Context menu" });
  await pressUntil(page, "Tab", '[data-dock-app="projects"]', 20);
  await page.keyboard.press("Shift+F10");
  await expect(contextMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(contextMenu).toHaveCount(0);
  await expect(dockIcon(page, "projects")).toBeFocused();
});

// Its own test, so a failure here does not hide the menus above. It is red
// until #158 is fixed: with nothing focused, Chromium sends the keyboard's
// `contextmenu` to the element under the viewport's top-left corner (the
// laptop's desk), and the desktop only opens its menu for the body. The real
// key is pressed on purpose; a synthetic event at the body would test nothing.
test("keyboard only: the desktop's own menu", async ({ page }) => {
  await openDesktop(page);
  await blurActive(page);
  const contextMenu = page.getByRole("menu", { name: "Context menu" });
  await page.keyboard.press("Shift+F10");
  await expect(contextMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(contextMenu).toHaveCount(0);
});
