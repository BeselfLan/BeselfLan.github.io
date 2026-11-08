import { content } from "@beself/content";
import { expect, test, type Page } from "@playwright/test";

// The About app, opened by its deep link. The expected values come from the
// content package, as desktop.spec.ts reads the name and tagline.
const { profile, education } = content;

test.setTimeout(60_000); // The first request compiles the route.
// Copy email writes to the clipboard, and the test reads it back.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
});
test.afterEach(() => {
  // A missing image logs a failed request, and a hydration mismatch logs too.
  expect(errors).toEqual([]);
});

// The detector from packages/content/src/content.test.ts.
const PHONE = /(?:\+?\d[\s().-]*){10,}|(?:\d[^A-Za-z0-9]{0,3}){9,}\d/;

const aboutWindow = (page: Page) => page.locator('[data-window-id="about"]');

/** Opens About by its deep link, after the boot that runs first. */
async function openAbout(page: Page) {
  await page.goto("/?app=about");
  await expect(aboutWindow(page)).toBeVisible({ timeout: 15_000 });
  // The app loads lazily: the window shows first, with a skeleton.
  await expect(aboutWindow(page).locator("[data-about]")).toBeVisible({
    timeout: 15_000,
  });
}

test("About opens from its deep link and shows the UTM entry", async ({
  page,
}) => {
  await openAbout(page);
  const about = aboutWindow(page);
  await expect(
    about.getByRole("heading", { name: education[0].school }),
  ).toBeVisible();
  await expect(about.getByText(education[0].program)).toBeVisible();
  // The card shows the name, and the placeholder is gone.
  await expect(
    about.getByRole("heading", { name: profile.name }),
  ).toBeVisible();
  await expect(about.getByText("Coming soon")).toHaveCount(0);
});

test("the links are right", async ({ page }) => {
  await openAbout(page);
  const about = aboutWindow(page);

  const mail = about.locator(`a[href="mailto:${profile.email}"]`);
  await expect(mail).toBeVisible();
  await expect(mail).toHaveText(profile.email);

  const github = about.locator(`a[href="${profile.github}"]`);
  await expect(github).toBeVisible();
  await expect(github).toHaveAttribute("target", "_blank");
  await expect(github).toHaveAttribute("rel", /noopener/);

  // Not clicked: they leave the page.
  const site = about.locator(`a[href="${profile.site}"]`);
  await expect(site).toBeVisible();
  await expect(site).toHaveAttribute("rel", /noopener/);
});

test("Copy email copies the address", async ({ page }) => {
  await openAbout(page);
  const about = aboutWindow(page);
  await expect(about.getByRole("status")).toHaveText("");

  await about.getByRole("button", { name: "Copy email" }).click();
  await expect(about.getByRole("status")).toHaveText("Copied email");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    profile.email,
  );
});

test("no phone number is shown", async ({ page }) => {
  await openAbout(page);
  // One text node at a time: joined text would glue a year range to a GPA.
  const { total, found } = await page.evaluate((source) => {
    const phone = new RegExp(source);
    const root = document.querySelector('[data-window-id="about"]')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let total = 0;
    const found: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? "";
      total++;
      if (phone.test(text)) found.push(text);
    }
    return { total, found };
  }, PHONE.source);
  // The walk saw the page, so an empty result means something.
  expect(total).toBeGreaterThan(20);
  expect(found).toEqual([]);
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
});
