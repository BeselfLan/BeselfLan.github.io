import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoSeriousAxe } from "./axe";

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
  }).toPass({ timeout: 10_000 });
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
  }).toPass({ timeout: 10_000 });

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
  }).toPass({ timeout: 10_000 });
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

test("the carousel turns under a finger", async ({ page }) => {
  await openPhone(page, "/?app=projects");
  await expect(page.locator("[data-entry-id]").first()).toBeVisible({
    timeout: 15_000,
  });
  await settled(page, "projects");

  // Without this the browser takes the drag for a pan or a pull, and cancels
  // the pointer the ring is following.
  const stage = page.locator("[data-carousel]");
  await expect(stage).toHaveCSS("touch-action", "none");

  const index = page.locator("[data-carousel-index]");
  const before = await index.textContent();
  await touchDrag(page, stage, -150, 0);
  await expect(async () => {
    expect(await index.textContent()).not.toBe(before);
  }).toPass({ timeout: 10_000 });

  // A tap on the front item opens the panel, and the panel fits the screen.
  // The tap is a touch at a point measured in the page once the ring has come
  // to rest, and not `locator.tap()`: Playwright finds the ring's 3D item
  // "outside of the viewport" though it is in the middle of the screen, and
  // `elementFromPoint` there is the item itself.
  await expect(async () => {
    const rings = await page.evaluate(async () => {
      const transform = () =>
        getComputedStyle(document.querySelector("[data-carousel-ring]")!)
          .transform;
      const first = transform();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return [first, transform()];
    });
    expect(rings[0], "the ring is still turning").toBe(rings[1]);
  }).toPass({ timeout: 10_000 });
  const front = await page.evaluate(() => {
    const el = document.querySelector("[data-carousel] [data-front]")!;
    const box = el.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    return {
      x,
      y,
      hit: document.elementFromPoint(x, y)?.closest("[data-front]") === el,
    };
  });
  expect(front.hit, "the front item is not under its own centre").toBe(true);
  await page.touchscreen.tap(front.x, front.y);
  const panel = page.locator("[data-detail-panel]");
  await expect(panel).toBeVisible();
  // The panel slides in, so its box is read until it has come to rest.
  await expect(async () => {
    const box = await rect(panel);
    expect(box.x, `panel x ${box.x}`).toBeGreaterThanOrEqual(-1);
    expect(
      box.x + box.width,
      `panel right ${box.x + box.width}`,
    ).toBeLessThanOrEqual(391);
    expect(box.width, `panel width ${box.width}`).toBeLessThanOrEqual(391);
  }).toPass({ timeout: 10_000 });
});

/**
 * The centre of a Skills icon in client pixels, measured in the page. It throws,
 * and is retried, unless the icon is the topmost thing at that point, so a moment
 * when another icon covers it is skipped. The icons never stop drifting, so
 * Playwright's "stable" check never passes for them: no test calls
 * `locator.tap()` on one.
 */
async function centreOf(page: Page, id: string) {
  let point = { x: 0, y: 0 };
  await expect(async () => {
    const hit = await page.evaluate((skillId) => {
      const el = document.querySelector(`[data-skill-id="${skillId}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y)?.closest("[data-skill-id]");
      return { x, y, onTop: top === el };
    }, id);
    expect(hit?.onTop, `${id} is not on top`).toBe(true);
    point = { x: hit!.x, y: hit!.y };
  }).toPass({ timeout: 5000 });
  return point;
}

test("a skill follows a finger", async ({ page }) => {
  // Motion is allowed, so Skills opens on its stage.
  await openPhone(page, "/?app=skills");
  const python = page.locator('[data-skill-id="python"]');
  await expect(python).toBeVisible({ timeout: 15_000 });
  await settled(page, "skills");
  const stage = page.locator("[data-skills-stage]");
  await expect(stage).toHaveCSS("touch-action", "none");
  await expect(python).toHaveCSS("touch-action", "none");

  // A tap opens the panel, as wide as the stage: it covers the whole stage on a
  // phone.
  const tap = await centreOf(page, "python");
  await page.touchscreen.tap(tap.x, tap.y);
  const panel = page.locator("[data-skill-panel]");
  await expect(panel).toBeVisible();
  expect(
    near((await rect(panel)).width, (await rect(stage)).width),
    `panel ${(await rect(panel)).width} wide, stage ${(await rect(stage)).width}`,
  ).toBe(true);
  await frame(page, "skills")
    .getByRole("button", { name: "Close panel" })
    .tap();
  await expect(panel).toHaveCount(0);

  // A drag moves the icon with the finger, toward the middle of the stage so a
  // wall never shortens it. The icons drift by about 20 units a second, so a
  // changed transform proves little: the distance is what a stage that ignored
  // the finger would fail.
  const start = await centreOf(page, "python");
  const before = await python.evaluate((el) => getComputedStyle(el).transform);
  const middle = await rect(stage);
  const dx = start.x < middle.x + middle.width / 2 ? 100 : -100;
  const dy = start.y < middle.y + middle.height / 2 ? 60 : -60;
  await touchDragFrom(page, start, dx, dy);

  const end = await centreOf(page, "python");
  const moved = Math.hypot(end.x - start.x, end.y - start.y);
  expect(moved, `python moved ${moved} px`).toBeGreaterThan(40);
  expect(
    await python.evaluate((el) => getComputedStyle(el).transform),
  ).not.toBe(before);
});

test("nothing is cut off at 390", async ({ page }) => {
  // Every button, link and Tab stop that is shown, outside a ring (which clips
  // on purpose) and outside a scroller (which is meant to scroll), lies inside
  // the window's box.
  async function expectNothingCut(id: string) {
    await settled(page, id);
    const { checked, cut } = await frame(page, id).evaluate((root) => {
      const bounds = root.getBoundingClientRect();
      const scrolls = (el: Element) => {
        const css = getComputedStyle(el);
        return /auto|scroll/.test(css.overflowX + css.overflowY);
      };
      let checked = 0;
      const cut: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex="0"]',
      )) {
        const box = el.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (el.closest("[data-carousel]")) continue;
        let inScroller = false;
        for (
          let up = el.parentElement;
          up && up !== root;
          up = up.parentElement
        ) {
          if (scrolls(up)) inScroller = true;
        }
        if (inScroller) continue;
        checked += 1;
        if (
          box.left < bounds.left - 1 ||
          box.top < bounds.top - 1 ||
          box.right > bounds.right + 1 ||
          box.bottom > bounds.bottom + 1
        ) {
          cut.push(
            el.getAttribute("aria-label") ??
              (el.textContent ?? "").trim().slice(0, 40),
          );
        }
      }
      return { checked, cut };
    });
    expect(checked, `${id} has controls to check`).toBeGreaterThanOrEqual(2);
    expect(cut, `${id} has controls outside its box`).toEqual([]);
  }

  await openPhone(page, "/?app=projects");
  await expect(page.locator("[data-entry-id]").first()).toBeVisible({
    timeout: 15_000,
  });
  await expectNothingCut("projects");

  await page.goto("/?app=skills");
  await expect(page.locator("[data-skill-id]").first()).toBeVisible({
    timeout: 15_000,
  });
  await expectNothingCut("skills");

  // "List view" is on one line, and inside its row: without `shrink-0` a narrow
  // toolbar squeezes it to two lines that are taller than the row.
  const listView = frame(page, "skills").getByRole("button", {
    name: "List view",
    exact: true,
  });
  const fit = await listView.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const row = (el.parentElement as HTMLElement).getBoundingClientRect();
    const text = document.createRange();
    text.selectNodeContents(el);
    return {
      aboveRow: row.top - box.top,
      belowRow: box.bottom - row.bottom,
      lines: text.getClientRects().length,
    };
  });
  expect(fit.aboveRow, "List view pokes out above its row").toBeLessThanOrEqual(
    1,
  );
  expect(fit.belowRow, "List view pokes out below its row").toBeLessThanOrEqual(
    1,
  );
  expect(fit.lines, "List view wraps onto more than one line").toBe(1);

  await page.goto("/?app=about");
  await expect(page.locator("[data-about]")).toBeVisible({ timeout: 15_000 });
  await expectNothingCut("about");

  await page.goto("/?app=hello");
  await expect(
    frame(page, "hello").getByRole("heading", { name: "Hello, world" }),
  ).toBeVisible({ timeout: 15_000 });
  await expectNothingCut("hello");

  await page.goto("/?app=projects&item=deadknight");
  const play = page
    .locator("[data-detail-panel]")
    .getByRole("button", { name: "Play demo", exact: true });
  await expect(play).toHaveAttribute("data-media", "ready", {
    timeout: 15_000,
  });
  await expectNothingCut("projects");

  await play.tap();
  const demo = "video-player:deadknight";
  await expect(
    frame(page, demo).locator('[data-video-state="ready"]'),
  ).toBeVisible({ timeout: 15_000 });
  await expectNothingCut(demo);

  // One video at a time: the host is short on memory.
  await frame(page, demo)
    .getByRole("button", { name: "Close", exact: true })
    .tap();
  await expect(frame(page, demo)).toHaveCount(0);
});

// axe over the whole page at 390x844, which no sibling scanned: the page-level
// rules, and the phone's own layout (fullscreen mode, the maximised windows and
// the dock at the bottom). Reduced motion, so nothing is caught mid-fade; the
// colours are the same either way.
test.describe("the phone passes axe", () => {
  test.use({ reducedMotion: "reduce" });

  test("the desktop, Projects with a panel, and Skills with a panel", async ({
    page,
  }) => {
    await openPhone(page);
    await expectNoSeriousAxe(page, "phone desktop");

    await page.goto("/?app=projects&item=deadknight");
    await expect(
      page
        .locator("[data-detail-panel]")
        .getByRole("button", { name: "Play demo", exact: true }),
    ).toHaveAttribute("data-media", "ready", { timeout: 15_000 });
    await settled(page, "projects");
    await expectNoSeriousAxe(page, "phone Projects with deadknight's panel");

    // Under reduced motion this is the list, with the panel over it.
    await page.goto("/?app=skills&item=python");
    await expect(page.locator("[data-skill-panel]")).toBeVisible({
      timeout: 15_000,
    });
    await settled(page, "skills");
    await expectNoSeriousAxe(page, "phone Skills with Python's panel");
  });
});
