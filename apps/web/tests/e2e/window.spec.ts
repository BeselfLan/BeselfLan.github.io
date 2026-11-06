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

export async function mouseDrag(
  page: Page,
  handle: Locator,
  dx: number,
  dy: number,
) {
  const box = await rect(handle);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

// Playwright's touchscreen only taps, so send the touch events directly.
export async function touchDrag(
  page: Page,
  handle: Locator,
  dx: number,
  dy: number,
) {
  const box = await rect(handle);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (
    type: "touchStart" | "touchMove" | "touchEnd",
    px: number,
    py: number,
  ) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: px, y: py }],
    });
  await send("touchStart", x, y);
  for (let i = 1; i <= 6; i++) {
    await send("touchMove", x + (dx * i) / 6, y + (dy * i) / 6);
  }
  await send("touchEnd", x + dx, y + dy);
  await cdp.detach();
}

async function openWindow(
  page: Page,
  width: number,
  height: number,
  scale: number,
) {
  await open(page, width, height, scale);
  await expect(page.getByTestId("harness-window")).toBeVisible();
}

async function expectMovedBy(
  page: Page,
  before: { x: number; y: number },
  dx: number,
  dy: number,
) {
  await expect(async () => {
    const now = await rect(page.getByTestId("harness-window"));
    expect(Math.abs(now.x - before.x - dx)).toBeLessThanOrEqual(1);
    expect(Math.abs(now.y - before.y - dy)).toBeLessThanOrEqual(1);
  }).toPass();
}

for (const [width, height, scale] of [
  [960, 600, 2 / 3],
  [1920, 1200, 4 / 3],
] as const) {
  test(`a mouse drag tracks the pointer at scale ${scale.toFixed(2)}`, async ({
    page,
  }) => {
    await openWindow(page, width, height, scale);
    const before = await rect(page.getByTestId("harness-window"));
    await mouseDrag(page, page.getByTestId("harness-handle"), 150, 90);
    await expectMovedBy(page, before, 150, 90);
  });
}

test.describe("touch", () => {
  test.use({ hasTouch: true });

  test("a touch drag tracks the pointer", async ({ page }) => {
    await openWindow(page, 960, 600, 2 / 3);
    const handle = page.getByTestId("harness-handle");
    await expect(handle).toHaveCSS("touch-action", "none");
    const before = await rect(page.getByTestId("harness-window"));
    await touchDrag(page, handle, 150, 90);
    await expectMovedBy(page, before, 150, 90);
  });
});

test("the clamp holds in the browser", async ({ page }) => {
  await openWindow(page, 960, 600, 2 / 3);
  const handle = page.getByTestId("harness-handle");
  const box = await rect(handle);
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(955, 595, { steps: 6 });
  await page.mouse.up();
  // 1400 and 860 screen units at scale 2/3.
  await expect(async () => {
    const now = await rect(page.getByTestId("harness-window"));
    expect(Math.abs(now.x - 933.3)).toBeLessThanOrEqual(1);
    expect(Math.abs(now.y - 573.3)).toBeLessThanOrEqual(1);
  }).toPass();
});
