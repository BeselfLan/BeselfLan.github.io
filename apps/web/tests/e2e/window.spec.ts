import { expect, test, type Locator, type Page } from "@playwright/test";

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
  expect(errors).toEqual([]);
});

export async function rect(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return box;
}

export async function open(
  page: Page,
  width: number,
  height: number,
  scale: number,
) {
  // Below 900 px the screen is fullscreen: the box is the viewport, 1:1.
  const boxWidth = width < 900 ? width : 1440 * scale;
  await page.setViewportSize({ width, height });
  await page.goto("/e2e-harness/");
  // The first render uses the virtual size until the first measurement.
  await expect(async () => {
    const box = await rect(page.locator("[data-screen-box]"));
    expect(box.width).toBeCloseTo(boxWidth, 0);
  }).toPass();
}

test("the screen is scaled and centred", async ({ page }) => {
  await open(page, 1200, 600, 2 / 3);
  const box = await rect(page.locator("[data-screen-box]"));
  expect(box.width).toBeCloseTo(960, 0);
  expect(box.height).toBeCloseTo(600, 0);
  expect(box.x).toBeCloseTo(120, 0);
  expect(box.y).toBeCloseTo(0, 0);
});

test("the screen fills its parent and clips", async ({ page }) => {
  await open(page, 1200, 600, 2 / 3);
  const boxEl = page.locator("[data-screen-box]");
  const parent = await rect(boxEl.locator(".."));
  expect(parent.width).toBeCloseTo(1200, 0);
  expect(parent.height).toBeCloseTo(600, 0);
  await expect(boxEl).toHaveCSS("overflow", "hidden");
});

test("fullscreen is one to one", async ({ page }) => {
  await open(page, 390, 844, 1);
  const box = await rect(page.locator("[data-screen-box]"));
  expect(box.width).toBeCloseTo(390, 0);
  expect(box.height).toBeCloseTo(844, 0);
  expect(box.x).toBeCloseTo(0, 0);
  expect(box.y).toBeCloseTo(0, 0);
});
