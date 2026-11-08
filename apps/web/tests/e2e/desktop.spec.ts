import { content } from "@beself/content";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The name and tagline come from the content package, so the test reads them
// from there too.
const { profile } = content;

test.setTimeout(60_000); // The first request compiles the route.

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
});
test.afterEach(() => {
  // A missing wallpaper file logs a failed request, so it fails the test here.
  expect(errors).toEqual([]);
});

async function rect(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return box;
}

/** Waits for the desktop to show, with room for a full boot (#74). */
async function openDesktop(page: Page) {
  await page.goto("/");
  await expect(page.locator("[data-desktop]")).toBeVisible({ timeout: 15_000 });
}

test("the top bar spans the top of the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDesktop(page);

  const bar = page.locator("[data-topbar]");
  await expect(bar).toBeVisible();
  // The bar slides in over 300 ms, so wait until it has settled.
  await expect(async () => {
    const box = await rect(page.locator("[data-screen-box]"));
    const b = await rect(bar);
    const scale = box.width / 1440;
    expect(Math.abs(b.y - box.y)).toBeLessThanOrEqual(1);
    // 32 screen units, whatever the scale: a bar in client px would not be.
    expect(Math.abs(b.height / scale - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.width - box.width)).toBeLessThanOrEqual(1);
  }).toPass();

  await expect(bar.getByRole("button", { name: "Activities" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "System menu" })).toBeVisible();
  await expect(bar.locator("[data-clock]")).toBeVisible();
});

test.describe("the wallpaper", () => {
  test("loads by default", async ({ page }) => {
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/wallpapers/aubergine.svg",
      { timeout: 15_000 },
    );
    await openDesktop(page);
    expect((await response).status()).toBe(200);
    await expect(page.locator('[data-wallpaper="aubergine"]')).toBeVisible();
  });

  test("follows a stored setting", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "beselfos:settings",
        JSON.stringify({
          state: { settings: { wallpaper: "mono" } },
          version: 0,
        }),
      );
    });
    await openDesktop(page);
    await expect(page.locator('[data-wallpaper="mono"]')).toBeVisible();
    await expect(page.locator('[data-wallpaper="aubergine"]')).toHaveCount(0);
  });
});

test.describe("the clock", () => {
  test.use({ timezoneId: "America/Toronto" });

  test("shows local time", async ({ page }) => {
    // Fixes only Date, so the boot timers keep running.
    await page.clock.setFixedTime(new Date("2026-11-04T14:05:00-05:00"));
    await openDesktop(page);
    const clock = page.locator("[data-clock]");
    await expect(clock).toContainText("Wed Nov 4");
    await expect(clock).toContainText("14:05");
  });
});

test("the network icon is honest", async ({ page }) => {
  await openDesktop(page);
  // v2's placeholder provider says "unknown" until #18.
  await expect(page.locator('[data-network-status="unknown"]')).toBeVisible();
  await expect(page.locator('[data-network-status="online"]')).toHaveCount(0);
});

test("the signature is visible in the bottom right", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDesktop(page);

  const signature = page.locator("[data-signature]");
  await expect(signature).toBeVisible();
  await expect(signature).toContainText(profile.name);
  await expect(signature).toContainText(profile.tagline);

  const box = await rect(page.locator("[data-screen-box]"));
  const s = await rect(signature);
  expect(s.x).toBeGreaterThanOrEqual(box.x + box.width / 2);
  expect(s.y).toBeGreaterThanOrEqual(box.y + box.height / 2);
  expect(s.x + s.width).toBeLessThanOrEqual(box.x + box.width + 1);
  expect(s.y + s.height).toBeLessThanOrEqual(box.y + box.height + 1);
});
