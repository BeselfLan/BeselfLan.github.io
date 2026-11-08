import { expect, test, type Page } from "@playwright/test";

// The full boot on `/` (plan 3.2, 3.3). #75's laptop tests join this file, so
// the helpers stay local and nothing is exported.

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

// The first request compiles the route, and that must not count against the
// timings below.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForSelector("[data-desktop]", { timeout: 90_000 });
  await context.close();
});

/**
 * Runs `fn` once per animation frame in the page until it returns something
 * truthy, and gives that value. Playwright's `expect` retries after 100, 250,
 * 500 and then 1000 ms, so a time read after it can be a second late; this one
 * reads in the frame where the condition first holds.
 */
async function inFrame<R>(page: Page, fn: () => R, timeout = 15_000) {
  const handle = await page.waitForFunction(fn, undefined, {
    polling: "raf",
    timeout,
  });
  return handle.jsonValue();
}

interface Entry {
  stage: string;
  at: number;
}
type Traced = Window & { __bootTrace?: Entry[] };

const DESKTOP_UP = () =>
  document.querySelector("[data-desktop]") !== null &&
  document.querySelector("[data-boot-stage]") === null
    ? performance.now()
    : 0;

test("a fresh context reaches the desktop in under 6 s", async ({ page }) => {
  await page.goto("/");
  const at = await inFrame(page, DESKTOP_UP);
  // Under next dev, from the start of the navigation. The upper bound is a
  // slow log; the lower bound is the stub's skip boot, which was done in under
  // a second.
  expect(at).toBeLessThan(6000);
  expect(at).toBeGreaterThanOrEqual(4000);
  await expect(page.locator("[data-desktop]")).toBeVisible();
});

test("stages play in order with the 3.2 durations", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Traced;
    const trace: Entry[] = (w.__bootTrace = []);
    let seen = false;
    let last: string | null = null;
    const tick = () => {
      const el = document.querySelector("[data-boot-stage]");
      if (el) seen = true;
      const stage = el
        ? el.getAttribute("data-boot-stage")
        : seen
          ? "gone"
          : null;
      if (stage !== null && stage !== last) {
        last = stage;
        trace.push({ stage, at: performance.now() });
      }
      if (stage !== "gone") requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto("/");
  await inFrame(page, () => {
    const trace = (window as unknown as Traced).__bootTrace ?? [];
    return trace.at(-1)?.stage === "gone";
  });
  const trace = await page.evaluate(
    () => (window as unknown as Traced).__bootTrace ?? [],
  );

  // The server HTML is the off screen, and hydration may or may not be seen.
  if (trace[0]?.stage === "off") trace.shift();
  expect(trace.map((e) => e.stage)).toEqual([
    "lid-opening",
    "power-on",
    "firmware",
    "boot-log",
    "desktop-enter",
    "gone",
  ]);
  const lasted = (i: number) => trace[i + 1].at - trace[i].at;
  const label = (i: number) => `${trace[i].stage} lasted ${lasted(i)} ms`;
  for (const [i, target] of [
    [0, 1000],
    [1, 300],
    [2, 500],
    [4, 400],
  ] as const) {
    expect(lasted(i), label(i)).toBeGreaterThanOrEqual(target - 50);
    expect(lasted(i), label(i)).toBeLessThanOrEqual(target + 400);
  }
  expect(lasted(3), label(3)).toBeGreaterThanOrEqual(2150);
  expect(lasted(3), label(3)).toBeLessThanOrEqual(3000);
});

test("the log is Ubuntu Mono, wraps, and keeps the newest line on screen", async ({
  page,
}) => {
  await page.goto("/");
  const style = await inFrame(page, () => {
    const log = document.querySelector("[data-boot-log]");
    if (!log) return null;
    const css = getComputedStyle(log);
    return { family: css.fontFamily, whiteSpace: css.whiteSpace };
  });
  expect(style?.family).toMatch(/Ubuntu.Mono/);
  expect(style?.whiteSpace).toBe("pre-wrap");

  const m = await inFrame(page, () => {
    const lines = [
      ...document.querySelectorAll<HTMLElement>("[data-boot-line]"),
    ];
    const last = lines.find((l) =>
      l.textContent?.includes("Reached target BeselfOS Desktop"),
    );
    if (!last) return null;
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const longest = lines.reduce((a, b) =>
      (b.textContent?.length ?? 0) > (a.textContent?.length ?? 0) ? b : a,
    );
    const box = document.querySelector("[data-screen-box]")!;
    return {
      last: rect(last),
      log: rect(document.querySelector("[data-boot-log]")!),
      box: rect(box),
      boxWidth: box.getBoundingClientRect().width,
      longestHeight: longest.getBoundingClientRect().height,
      longestLength: longest.textContent?.length ?? 0,
      overflowing: lines.filter((l) => l.scrollWidth > l.clientWidth + 1)
        .length,
      count: lines.length,
    };
  });
  expect(m).not.toBeNull();
  if (!m) return;

  // The newest line is inside the log and inside the screen, to a pixel.
  for (const outer of [m.log, m.box]) {
    expect(m.last.left).toBeGreaterThanOrEqual(outer.left - 1);
    expect(m.last.top).toBeGreaterThanOrEqual(outer.top - 1);
    expect(m.last.right).toBeLessThanOrEqual(outer.right + 1);
    expect(m.last.bottom).toBeLessThanOrEqual(outer.bottom + 1);
  }
  // Nothing runs off the side, and the longest line wraps onto a second row
  // (197 characters against about 174 columns), so the wrap is real.
  expect(m.overflowing).toBe(0);
  expect(m.longestLength).toBeGreaterThan(174);
  const scale = m.boxWidth / 1440;
  expect(m.longestHeight).toBeGreaterThanOrEqual(2 * 20 * scale - 1);
});

interface Seen {
  glow?: string;
  bar?: string;
  leaving?: {
    animation: string;
    pointerEvents: string;
    underIsDesktop: boolean;
  };
}
type Watched = Window & { __bootSeen?: Seen };

test("the boot screens animate and desktop-enter lets the pointer through", async ({
  page,
}) => {
  // A frame loop from the first moment, so a 300 ms stage cannot be missed.
  await page.addInitScript(() => {
    const seen: Seen = ((window as unknown as Watched).__bootSeen = {});
    const tick = () => {
      const layer = document.querySelector(
        '[data-boot-stage="power-on"] [aria-hidden]',
      );
      if (layer && seen.glow === undefined) {
        seen.glow = getComputedStyle(layer).animationName;
      }
      const bar = document.querySelector("[data-boot-progress]");
      if (bar && seen.bar === undefined) {
        seen.bar = getComputedStyle(bar).animationName;
      }
      const root = document.querySelector('[data-boot-stage="desktop-enter"]');
      if (root) {
        const css = getComputedStyle(root);
        const box = document
          .querySelector("[data-screen-box]")!
          .getBoundingClientRect();
        const under = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        seen.leaving = {
          animation: css.animationName,
          pointerEvents: css.pointerEvents,
          underIsDesktop: !!under?.closest("[data-desktop]"),
        };
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto("/");
  await inFrame(
    page,
    () => (window as unknown as Watched).__bootSeen?.leaving !== undefined,
  );
  const seen = await page.evaluate(
    () => (window as unknown as Watched).__bootSeen,
  );

  // CSS that did not apply reads "none". The glow only runs when the visitor
  // has not asked for less motion, which is Chromium's default here.
  expect(seen?.glow).toMatch(/boot-glow-in/);
  expect(seen?.bar).toMatch(/boot-fill-bar/);
  expect(seen?.leaving?.animation).toMatch(/boot-fade-away/);
  // The desktop beneath gets the pointer while the log fades.
  expect(seen?.leaving?.pointerEvents).toBe("none");
  expect(seen?.leaving?.underIsDesktop).toBe(true);
});

test("Skip lands on the desktop", async ({ page }) => {
  await page.goto("/");
  await inFrame(
    page,
    () => document.querySelector('[data-boot-stage="boot-log"]') !== null,
  );
  const t0 = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Skip" }).click();
  const t1 = await inFrame(page, DESKTOP_UP, 5000);
  expect(t1).toBeLessThan(t0 + 1000);
  await expect(page.locator("[data-desktop]")).toBeVisible();
  await expect(page.locator("[data-boot-stage]")).toHaveCount(0);
});

test("one polite live region", async ({ page }) => {
  await page.goto("/");
  // Measured in the frame where the region first reads the projects header.
  const m = await inFrame(page, () => {
    const regions = document.querySelectorAll(
      '[data-boot-stage] [aria-live="polite"]',
    );
    if (regions[0]?.textContent !== "Loading my projects...") return null;
    return {
      stage: document
        .querySelector("[data-boot-stage]")
        ?.getAttribute("data-boot-stage"),
      regions: regions.length,
      logs: document.querySelectorAll('[data-boot-stage] [role="log"]').length,
      hiddenLog: document
        .querySelector("[data-boot-log]")
        ?.getAttribute("aria-hidden"),
    };
  });
  expect(m).toEqual({
    stage: "boot-log",
    regions: 1,
    logs: 0,
    hiddenLog: "true",
  });
});
