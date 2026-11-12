import { expect, test, type Locator, type Page } from "@playwright/test";

// The phone, 390x844 (#24, #149; plan 8.1, D4): no bezel, the dock at the
// bottom, every window maximised, no page scroll, nothing cut off, a ring and a
// physics stage that follow a finger, and axe over the whole page. The viewport
// has real mobile emulation (`isMobile` honours the viewport meta tag) and a
// touch screen. At 390 the screen is 1:1, so a screen unit is a client px.
//
// Playwright's touchscreen only taps, so a drag sends the touch events through
// the DevTools protocol, as `touchDrag` in window.spec.ts does. The helpers are
// copies: specs share none, and one spec importing another is fragile.

test.setTimeout(90_000); // The first request compiles the route.
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

// A console error or a page error fails the test.
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
 * Loads `path` as a welcomed session (the welcome toast would sit on the
 * wallpaper a swipe starts on) and waits for the desktop. A deep link
 * (`/?app=...`) fast-boots, and so does `?boot=skip`.
 */
async function openPhone(page: Page, path = "/?boot=skip") {
  await page.addInitScript(() =>
    sessionStorage.setItem("beselfos:welcomed", "1"),
  );
  await page.goto(path);
  await expect(page.locator("[data-desktop]")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-boot-stage]")).toHaveCount(0, {
    timeout: 5_000,
  });
}

async function rect(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return box;
}

/**
 * Touches down at `point`, moves by (dx, dy) in six steps, holds still, and
 * lifts. Each event carries its own timestamp: 16 ms between the moves and
 * 200 ms of stillness before the lift. Six moves sent with no time between them
 * are a flick to Chromium, and the fling that follows swallows the next tap
 * (no click comes of it); a finger that stops before it lifts leaves no fling.
 * The timestamps are what the gesture sees, so nothing here sleeps.
 */
async function touchDragFrom(
  page: Page,
  point: { x: number; y: number },
  dx: number,
  dy: number,
) {
  const cdp = await page.context().newCDPSession(page);
  let at = Date.now() / 1000; // seconds, as CDP's TimeSinceEpoch
  const send = (
    type: "touchStart" | "touchMove" | "touchEnd",
    px: number,
    py: number,
  ) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: px, y: py }],
      timestamp: at,
    });
  await send("touchStart", point.x, point.y);
  for (let i = 1; i <= 6; i++) {
    at += 0.016;
    await send("touchMove", point.x + (dx * i) / 6, point.y + (dy * i) / 6);
  }
  at += 0.2;
  await send("touchMove", point.x + dx, point.y + dy);
  await send("touchEnd", point.x + dx, point.y + dy);
  await cdp.detach();
}

/** The same drag, starting at the centre of `handle`. */
async function touchDrag(page: Page, handle: Locator, dx: number, dy: number) {
  const box = await rect(handle);
  await touchDragFrom(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    dx,
    dy,
  );
}

const frame = (page: Page, id: string) =>
  page.locator(`[data-window-id="${id}"]`);
const surface = (page: Page, id: string) =>
  frame(page, id).locator(":scope > div");

/**
 * The window has finished fading in. axe reads a fading element at its current
 * opacity and reports a false colour-contrast failure for it (#145), and a box
 * is not final until the enter is over.
 */
async function settled(page: Page, id: string) {
  await expect(surface(page, id)).toHaveCSS("opacity", "1");
}

const near = (actual: number, expected: number, within = 1) =>
  Math.abs(actual - expected) <= within;

/**
 * The window fills the screen between the 32 px top bar and the 64 px dock
 * (844 less 96 is 748), has no Maximise or Restore button, and a touch drag on
 * its title bar leaves its box where it was.
 */
async function expectMaximised(page: Page, id: string) {
  const win = frame(page, id);
  await expect(async () => {
    const box = await rect(win);
    expect(
      [box.x, box.y, box.width, box.height].map(Math.round),
      `${id} box ${JSON.stringify(box)}`,
    ).toEqual([0, 32, 390, 748]);
  }).toPass();
  for (const name of ["Maximise", "Restore"]) {
    await expect(win.getByRole("button", { name, exact: true })).toHaveCount(0);
  }

  const before = await rect(win);
  await touchDrag(page, win.locator("[data-titlebar]"), 60, 120);
  // Two frames, so a window that moved has been drawn there.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const after = await rect(win);
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(near(after[key], before[key]), `${id} ${key} after a drag`).toBe(
      true,
    );
  }
}

test("no bezel, and the page never scrolls", async ({ page }) => {
  await openPhone(page);

  const laptop = page.locator("[data-laptop]");
  await expect(laptop).toHaveAttribute("data-mode", "fullscreen");
  await expect(page.locator("[data-laptop-webcam]")).toBeHidden();
  await expect(page.locator("[data-laptop-lip]")).toBeHidden();
  await expect(async () => {
    const box = await rect(page.locator("[data-screen-box]"));
    expect(
      [box.x, box.y, box.width, box.height].map(Math.round),
      `screen box ${JSON.stringify(box)}`,
    ).toEqual([0, 0, 390, 844]);
  }).toPass();

  const extent = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return {
      scrollHeight: el.scrollHeight,
      scrollWidth: el.scrollWidth,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
    };
  });
  expect(extent.scrollHeight).toBeLessThanOrEqual(extent.innerHeight);
  expect(extent.scrollWidth).toBeLessThanOrEqual(extent.innerWidth);

  // Down the wallpaper and back up again: no scroll, no pull-to-refresh.
  await touchDragFrom(page, { x: 195, y: 300 }, 0, 400);
  await touchDragFrom(page, { x: 195, y: 700 }, 0, -400);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = await rect(page.locator("[data-screen-box]"));
  expect(near(box.y, 0), `screen box top ${box.y}`).toBe(true);
});

test("the dock is at the bottom, full width", async ({ page }) => {
  await openPhone(page);
  const dock = page.locator("[data-dock]");
  await expect(dock).toHaveAttribute("data-dock-side", "bottom");
  // The dock slides in for 300 ms, so its box is read until it settles.
  await expect(async () => {
    const box = await rect(dock);
    expect(near(box.x, 0), `dock x ${box.x}`).toBe(true);
    expect(
      near(box.y + box.height, 844),
      `dock bottom ${box.y + box.height}`,
    ).toBe(true);
    expect(near(box.width, 390), `dock width ${box.width}`).toBe(true);
  }).toPass();
});

test("every window opens maximised", async ({ page }) => {
  await openPhone(page);

  for (const id of ["projects", "skills", "about"]) {
    await page.locator(`[data-dock-app="${id}"]`).tap();
    await expect(frame(page, id)).toBeVisible({ timeout: 15_000 });
    await settled(page, id);
    await expectMaximised(page, id);
  }

  // Hello is only in the App Grid.
  await page.getByRole("button", { name: "Show Applications" }).tap();
  await expect(page.locator("[data-app-grid]")).toBeVisible();
  await page.locator('[data-app-grid-tile="hello"]').tap();
  await expect(frame(page, "hello")).toBeVisible({ timeout: 15_000 });
  await settled(page, "hello");
  await expectMaximised(page, "hello");

  // The demo window, through Play.
  await page.goto("/?app=projects&item=deadknight");
  const play = page
    .locator("[data-detail-panel]")
    .getByRole("button", { name: "Play demo", exact: true });
  await expect(play).toHaveAttribute("data-media", "ready", {
    timeout: 15_000,
  });
  await play.tap();
  const demo = "video-player:deadknight";
  await expect(frame(page, demo)).toBeVisible({ timeout: 15_000 });
  await settled(page, demo);
  await expectMaximised(page, demo);

  // One video at a time: the host is short on memory.
  await frame(page, demo)
    .getByRole("button", { name: "Close", exact: true })
    .tap();
  await expect(frame(page, demo)).toHaveCount(0);
});
