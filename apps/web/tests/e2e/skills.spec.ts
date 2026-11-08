import { expect, test, type Page } from "@playwright/test";

// The Skills window in Chromium: the tabs, the floating emblems, a drag, a
// click and the keyboard (#89). #90 adds the detail panel, the list view and
// its own tests to this file.
//
// The icons never stop drifting, so Playwright's "stable" check never passes
// for them: no test calls `locator.click()` on an icon. A click or a drag is
// `page.mouse` at a point measured a moment before, and the measuring is
// retried until the icon is the topmost thing there.

test.setTimeout(60_000); // The first request compiles the route.
test.use({ viewport: { width: 1440, height: 900 } });

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

const win = (page: Page) => page.locator('[data-window-id="skills"]');
const icons = (page: Page) => win(page).locator("[data-skill-id]");
const icon = (page: Page, id: string) =>
  win(page).locator(`[data-skill-id="${id}"]`);

// Opens through the deep link, never through the desktop's stub launcher. A
// deep link fast-boots (#14); the app is a lazy chunk, so the window shows a
// skeleton before the icons.
async function openSkills(page: Page, query = "") {
  await page.goto(`/?app=skills${query}`);
  await expect(win(page)).toBeVisible({ timeout: 15_000 });
  await icons(page).first().waitFor();
}

// `exact`: a name is otherwise a case-insensitive substring, and "All" would
// also match other buttons.
const chip = (page: Page, name: string) =>
  win(page)
    .getByRole("group", { name: "Category" })
    .getByRole("button", { name, exact: true });

/**
 * The centre of an icon in client pixels, measured in the page. It throws, and
 * is retried, unless the icon is the topmost thing at that point, so a moment
 * when another icon covers it is skipped.
 */
async function centreOf(page: Page, id: string) {
  let point = { x: 0, y: 0, half: 0 };
  await expect(async () => {
    const hit = await page.evaluate((skillId) => {
      const el = document.querySelector(`[data-skill-id="${skillId}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y)?.closest("[data-skill-id]");
      return { x, y, half: r.width / 2, onTop: top === el };
    }, id);
    expect(hit?.onTop, `${id} is not on top`).toBe(true);
    point = { x: hit!.x, y: hit!.y, half: hit!.half };
  }).toPass({ timeout: 5000 });
  return point;
}

const PRACTICES = [
  "Object Oriented Programming",
  "Agile development",
  "REST API design",
  "Google OAuth / JWT",
];

test("a deep link opens Skills on All", async ({ page }) => {
  await openSkills(page);
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
  for (const other of ["Languages", "Frameworks", "Libraries", "Tools"]) {
    await expect(chip(page, other)).toHaveAttribute("aria-pressed", "false");
  }
  await expect(icons(page)).toHaveCount(45);
  await expect(icons(page).first()).toHaveAttribute("data-skill-id", "python");
  await expect(icons(page).last()).toHaveAttribute(
    "data-skill-id",
    "sharepoint",
  );
  await expect(win(page).locator("[data-selected]")).toHaveCount(0);
  // The four practices are labels in the footer, not buttons.
  for (const name of PRACTICES) {
    await expect(win(page).getByText(name, { exact: true })).toBeVisible();
    await expect(
      win(page).getByRole("button", { name, exact: true }),
    ).toHaveCount(0);
  }
  // Every emblem is drawn (no image to fail).
  await expect(win(page).locator("[data-skill-icon]")).toHaveCount(45);
});

test("tab Tools reduces the icon count", async ({ page }) => {
  await openSkills(page);
  await expect(icons(page)).toHaveCount(45);
  await chip(page, "Tools").click();
  await expect(chip(page, "Tools")).toHaveAttribute("aria-pressed", "true");
  await expect(icons(page)).toHaveCount(17);
  await expect(icons(page).first()).toHaveAttribute("data-skill-id", "git");
  await chip(page, "All").click();
  await expect(icons(page)).toHaveCount(45);
});

test("every icon sits inside the stage", async ({ page }) => {
  await openSkills(page);
  const outside = await page.evaluate(() => {
    const stage = document
      .querySelector('[data-window-id="skills"] [data-skills-stage]')!
      .getBoundingClientRect();
    return [
      ...document.querySelectorAll('[data-window-id="skills"] [data-skill-id]'),
    ]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left < stage.left - 1 ||
          r.top < stage.top - 1 ||
          r.right > stage.right + 1 ||
          r.bottom > stage.bottom + 1
        );
      })
      .map((el) => el.getAttribute("data-skill-id"));
  });
  expect(outside).toEqual([]);
});

test("drag an icon 300 px", async ({ page }) => {
  await openSkills(page);
  const stage = await win(page).locator("[data-skills-stage]").boundingBox();
  if (!stage) throw new Error("the stage has no box");
  const start = await centreOf(page, "python");
  // Towards the middle of the stage, so the target stays inside the walls
  // where the world clamps a grabbed icon.
  const dx = start.x < stage.x + stage.width / 2 ? 300 : -300;
  const end = { x: start.x + dx, y: start.y };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });

  // While held, the icon is under the pointer: within half its width of it.
  await expect(async () => {
    const now = await centreOf(page, "python");
    expect(Math.abs(now.x - end.x)).toBeLessThan(start.half);
    expect(Math.abs(now.y - end.y)).toBeLessThan(start.half);
  }).toPass({ timeout: 5000 });

  await page.mouse.up();
  // A drag is not a click.
  await expect(icon(page, "python")).not.toHaveAttribute("data-selected", "");
  await expect(win(page).locator("[data-selected]")).toHaveCount(0);
});

test("click selects", async ({ page }) => {
  await openSkills(page);
  await expect(async () => {
    const p = await centreOf(page, "python");
    await page.mouse.click(p.x, p.y);
    await expect(icon(page, "python")).toHaveAttribute("data-selected", "", {
      timeout: 1000,
    });
  }).toPass({ timeout: 10_000 });
  await expect(win(page).locator("[data-selected]")).toHaveCount(1);

  // Another icon takes the selection.
  await expect(async () => {
    const p = await centreOf(page, "java");
    await page.mouse.click(p.x, p.y);
    await expect(icon(page, "java")).toHaveAttribute("data-selected", "", {
      timeout: 1000,
    });
  }).toPass({ timeout: 10_000 });
  await expect(win(page).locator("[data-selected]")).toHaveCount(1);
  await expect(icon(page, "python")).not.toHaveAttribute("data-selected", "");
});

test("keyboard", async ({ page }) => {
  await openSkills(page);
  const stop = win(page).locator('[data-skill-id][tabindex="0"]');
  await expect(stop).toHaveCount(1);
  await expect(stop).toHaveAttribute("data-skill-id", "python");
  await stop.focus();
  await expect(icon(page, "python")).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(icon(page, "java")).toBeFocused();
  await expect(stop).toHaveAttribute("data-skill-id", "java");

  await page.keyboard.press("Enter");
  await expect(icon(page, "java")).toHaveAttribute("data-selected", "");
  await expect(win(page).locator("[data-selected]")).toHaveCount(1);

  // The label is the name, and shows with the focus ring.
  await expect(icon(page, "java")).toHaveAccessibleName("Java");

  await page.keyboard.press("End");
  await expect(icons(page).last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(icons(page).first()).toBeFocused();
});

test("an item link selects it", async ({ page }) => {
  await openSkills(page, "&item=python");
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(icon(page, "python")).toHaveAttribute("data-selected", "");
  await expect(win(page).locator("[data-selected]")).toHaveCount(1);
});

test("an item and a tab link press the tab and select the item", async ({
  page,
}) => {
  await openSkills(page, "&item=git&tab=tool");
  await expect(chip(page, "Tools")).toHaveAttribute("aria-pressed", "true");
  await expect(icons(page)).toHaveCount(17);
  await expect(icon(page, "git")).toHaveAttribute("data-selected", "");
});
