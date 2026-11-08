import { expect, test, type Page } from "@playwright/test";

// The Projects window in Chromium (#82): the chips, the count, the selection
// and the entry icons. #83 and #18 add their own tests to this file.

test.setTimeout(60_000); // The first request compiles the route.

// A missing icon file is a 404 on /icons/, which the browser also logs as a
// console error. Recording the response names the file.
const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("response", (res) => {
    const { pathname } = new URL(res.url());
    if (pathname.startsWith("/icons/") && res.status() >= 400) {
      errors.push(`${res.status()} ${res.url()}`);
    }
  });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const win = (page: Page) => page.locator('[data-window-id="projects"]');

// Opens through the deep link, never through the desktop's stub launcher. The
// app is a lazy chunk, so the window shows a skeleton before the entries.
async function openProjects(page: Page, query = "") {
  await page.goto(`/?app=projects${query}`);
  await expect(win(page)).toBeVisible({ timeout: 15_000 });
  await win(page).locator("[data-entry-id]").first().waitFor();
}

// `exact`: a name is otherwise a case-insensitive substring, and "All" or
// "Projects" would also match other buttons.
const chip = (page: Page, name: string) =>
  win(page)
    .getByRole("group", { name: "Filter" })
    .getByRole("button", { name, exact: true });
const entries = (page: Page) => win(page).locator("[data-entry-id]");
const count = (page: Page) => win(page).locator("[data-count]");

test("a deep link opens Projects on Featured", async ({ page }) => {
  await openProjects(page);
  await expect(chip(page, "Featured")).toHaveAttribute("aria-pressed", "true");
  for (const other of [
    "All",
    "Projects",
    "Hackathons",
    "Experience",
    "Volunteer",
  ]) {
    await expect(chip(page, other)).toHaveAttribute("aria-pressed", "false");
  }
  await expect(count(page)).toHaveText("13 items");
  await expect(entries(page)).toHaveCount(13);
  await expect(entries(page).first()).toHaveAttribute(
    "data-entry-id",
    "bash-shell",
  );
  await expect(win(page).locator("[data-selected]")).toHaveCount(0);
});

test("every icon loads", async ({ page }) => {
  await openProjects(page);
  const images = win(page).locator("img");
  await expect(images).toHaveCount(13);
  await expect
    .poll(() =>
      images.evaluateAll((list) =>
        list.every(
          (img) =>
            (img as HTMLImageElement).complete &&
            (img as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
  // The afterEach fails on a console error or an /icons/ response of 400 or
  // more, so a file that is missing fails twice.
});

test("the chips filter the entries", async ({ page }) => {
  await openProjects(page);

  await chip(page, "Hackathons").click();
  await expect(chip(page, "Hackathons")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(entries(page)).toHaveCount(2);
  await expect(count(page)).toHaveText("2 items");

  await chip(page, "All").click();
  await expect(entries(page)).toHaveCount(23);
  await expect(count(page)).toHaveText("23 items");

  // Pong has no drawn icon: a tile of its initial, and no image.
  const pong = win(page).locator('[data-entry-id="pong"]');
  await expect(pong.locator("[data-icon-tile]")).toHaveText("P");
  await expect(pong.locator("img")).toHaveCount(0);
  // Thirteen drawn icons stay, and ten entries have a tile.
  await expect(win(page).locator("img")).toHaveCount(13);
  await expect(win(page).locator("[data-icon-tile]")).toHaveCount(10);
});

test("an item link selects it", async ({ page }) => {
  await openProjects(page, "&item=pong");
  // Pong is not featured, so the view switches to All.
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(win(page).locator("[data-selected]")).toHaveCount(1);
  await expect(win(page).locator("[data-selected]")).toHaveAttribute(
    "data-entry-id",
    "pong",
  );
});
