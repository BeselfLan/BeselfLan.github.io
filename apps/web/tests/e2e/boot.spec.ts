import { expect, test, type Locator, type Page } from "@playwright/test";

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

// The laptop (#75). These share the helpers above.

async function rect(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return box;
}

test("the server HTML is the closed laptop", async ({ page }) => {
  const html = await (await page.request.get("/")).text();
  expect(html).toContain('data-lid="closed"');
  expect(html).toContain('data-boot-stage="off"');
});

interface LidFrame {
  at: number;
  /** The boot stage, or "gone" once the boot overlay is removed. */
  stage: string;
  lid: string | null;
  lidTransform: string;
  cameraTransform: string;
  perspective: string;
}
type LidWatched = Window & { __lidTrace?: LidFrame[] };

test("the lid opens during lid-opening and is flat after", async ({ page }) => {
  // A frame loop from the first moment: lid-opening is 1000 ms long.
  await page.addInitScript(() => {
    const trace: LidFrame[] = ((window as unknown as LidWatched).__lidTrace =
      []);
    let seen = false;
    const tick = () => {
      const root = document.querySelector("[data-boot-stage]");
      if (root) seen = true;
      const stage = root
        ? root.getAttribute("data-boot-stage")
        : seen
          ? "gone"
          : null;
      const laptop = document.querySelector("[data-laptop]");
      const lid = document.querySelector("[data-laptop-lid]");
      const camera = document.querySelector("[data-laptop-camera]");
      if (stage !== null && laptop && lid && camera) {
        trace.push({
          at: performance.now(),
          stage,
          lid: laptop.getAttribute("data-lid"),
          lidTransform: getComputedStyle(lid).transform,
          cameraTransform: getComputedStyle(camera).transform,
          perspective: getComputedStyle(laptop).perspective,
        });
      }
      if (stage !== "gone") requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto("/");
  await inFrame(page, () => {
    const trace = (window as unknown as LidWatched).__lidTrace ?? [];
    return trace.at(-1)?.stage === "gone";
  });
  const trace = await page.evaluate(
    () => (window as unknown as LidWatched).__lidTrace ?? [],
  );

  // The lid is "opening" exactly while the stage is lid-opening.
  for (const f of trace) {
    expect(f.lid === "opening", `${f.stage} frame has lid ${f.lid}`).toBe(
      f.stage === "lid-opening",
    );
  }
  // It was closed before, and it moves rather than snaps: some frame well into
  // the stage still has a transform.
  expect(trace[0].lid).toBe("closed");
  expect(trace[0].lidTransform).not.toBe("none");
  const opening = trace.filter((f) => f.stage === "lid-opening");
  expect(opening.length).toBeGreaterThan(0);
  const midway = opening.filter((f) => f.at >= opening[0].at + 400);
  expect(midway.length).toBeGreaterThan(0);
  expect(midway.some((f) => f.lidTransform !== "none")).toBe(true);

  // Settled is flat: nothing is transformed and the desk has no perspective,
  // or Screen's rect, and the text in it, would be off. The first frames of
  // power-on are left out, because motion writes the instant snap on its next
  // frame.
  const powerOn = trace.filter((f) => f.stage === "power-on");
  expect(powerOn.length).toBeGreaterThan(0);
  const settled = powerOn.filter((f) => f.at >= powerOn[0].at + 100);
  expect(settled.length).toBeGreaterThan(0);
  for (const f of settled) {
    expect(f.lidTransform).toBe("none");
    expect(f.cameraTransform).toBe("none");
    expect(f.perspective).toBe("none");
  }
  for (const f of trace.filter((f) => f.stage === "gone")) {
    expect(f.lidTransform).toBe("none");
    expect(f.cameraTransform).toBe("none");
  }
});

for (const [width, height] of [
  [1280, 800],
  [1920, 1080],
] as const) {
  test(`the settled screen fills most of the viewport inside a bezel at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await inFrame(page, DESKTOP_UP);
    await expect(page.locator("[data-desktop]")).toBeVisible();

    const screenBox = page.locator("[data-screen-box]");
    const bezel = page.locator("[data-laptop-bezel]");
    const lip = page.locator("[data-laptop-lip]");
    await expect(lip).toBeVisible();
    await expect(page.locator("[data-laptop-deck]")).toBeHidden();

    await expect(async () => {
      const box = await rect(screenBox);
      const outer = await rect(bezel);
      // The screen is inside the viewport and fills most of one dimension.
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(
        box.height >= 0.85 * height || box.width >= 0.85 * width,
        `the screen is ${box.width} x ${box.height} in ${width} x ${height}`,
      ).toBe(true);

      // The bezel surrounds it by a thin margin on every side.
      for (const gap of [
        box.x - outer.x,
        box.y - outer.y,
        outer.x + outer.width - (box.x + box.width),
        outer.y + outer.height - (box.y + box.height),
      ]) {
        expect(gap).toBeGreaterThanOrEqual(4);
        expect(gap).toBeLessThanOrEqual(40);
      }

      // No letterbox in the bezel: the box is as wide as the bezel's content.
      const inner = await bezel.evaluate((el) => {
        const css = getComputedStyle(el);
        return (
          el.clientWidth -
          parseFloat(css.paddingLeft) -
          parseFloat(css.paddingRight)
        );
      });
      expect(Math.abs(box.width - inner)).toBeLessThanOrEqual(2);

      // The lip is a thin strip under the bezel.
      const edge = await rect(lip);
      expect(edge.y).toBeGreaterThanOrEqual(outer.y + outer.height - 1);
      expect(edge.height).toBeLessThanOrEqual(24);
    }).toPass();
  });
}

test("fullscreen is the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await inFrame(page, DESKTOP_UP);
  await expect(page.locator("[data-desktop]")).toBeVisible();

  await expect(async () => {
    const box = await rect(page.locator("[data-screen-box]"));
    expect(Math.abs(box.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.width - 390)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.height - 844)).toBeLessThanOrEqual(1);
    // The bezel has no padding, so it is the screen.
    const bezel = await rect(page.locator("[data-laptop-bezel]"));
    expect(Math.abs(bezel.width - box.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(bezel.height - box.height)).toBeLessThanOrEqual(1);
  }).toPass();
  await expect(page.locator("[data-laptop-lip]")).toBeHidden();
  await expect(page.locator("[data-laptop-webcam]")).toBeHidden();
  await expect(page.locator("[data-laptop-deck]")).toBeHidden();
});
