import { content } from "@beself/content";
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

// An opt-in CPU throttle (#124): BOOT_CPU_THROTTLE=4 slows the page's main
// thread four times through the DevTools protocol, as a stand-in for a slow
// CI runner. Unset, nothing changes.
const THROTTLE = Number(process.env.BOOT_CPU_THROTTLE ?? "1");
test.beforeEach(async ({ page }) => {
  if (!(THROTTLE > 1)) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
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

// The boot's own clock (#124): BootSequence marks each stage when it starts
// that stage's timer (os/boot/trace.ts), named "beselfos:boot:<stage>", with
// { stage, mode, ms } in its detail. `at` is the mark's time since navigation.
interface BootMark {
  stage: string;
  mode: string;
  ms: number | null;
  at: number;
}

/** The marks of the newest boot in this page, from its first stage to the desktop. */
async function bootMarks(page: Page): Promise<BootMark[]> {
  // The desktop mark is written in an effect, which can come a frame after
  // the DOM shows the desktop.
  await inFrame(page, () => {
    const names = performance
      .getEntriesByType("mark")
      .map((m) => m.name)
      .filter((n) => n.startsWith("beselfos:boot:"));
    return names.at(-1) === "beselfos:boot:desktop";
  });
  const marks: BootMark[] = await page.evaluate(() =>
    performance
      .getEntriesByType("mark")
      .filter((m) => m.name.startsWith("beselfos:boot:"))
      .map((m) => ({ ...(m as PerformanceMark).detail, at: m.startTime })),
  );
  // Strict Mode marks the mount's `off` twice under next dev; a restart starts
  // at `restarting`.
  const first = marks.findLastIndex(
    (m) => m.stage === "lid-opening" || m.stage === "restarting",
  );
  expect(first, "no boot mark").toBeGreaterThanOrEqual(0);
  return marks.slice(first);
}

// A starved browser can stretch one boot past 6 s on a busy host (#124: one
// run in 11 at a 4x CPU throttle). A boot that is slow by design fails both
// attempts, because the scheduled total and the stage timers repeat exactly;
// a stall rarely repeats, and Playwright reports the pass as flaky.
// Override: delete the configure line and accept the rare failure.
test.describe("the full boot's time", () => {
  test.describe.configure({ retries: 1 });

  test("a fresh context reaches the desktop in under 6 s", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await inFrame(page, DESKTOP_UP);
    const marks = await bootMarks(page);
    expect(marks.map((m) => m.stage)).toEqual([
      "lid-opening",
      "power-on",
      "firmware",
      "boot-log",
      "desktop-enter",
      "desktop",
    ]);
    for (const m of marks) expect(m.mode, m.stage).toBe("full");
    // What the stage clock scheduled, which no host can stretch: 3.2's fixed
    // stages total 2200 ms, and the log is capped at 2600 (LOG_MAX_MS, #73).
    const scheduled = marks.reduce((sum, m) => sum + (m.ms ?? 0), 0);
    // How long it took, from the first stage's mark to the desktop's. Loading
    // the page comes before the first mark and is not counted: a busy host
    // stretches it, most of all under next dev (#124). No stage ends early.
    const took = marks.at(-1)!.at - marks[0].at;
    // Every attempt prints its numbers before any timing assertion can stop it,
    // so a stall shows which stage absorbed the time.
    const offsets = marks
      .slice(1)
      .map((m) => `${m.stage} +${Math.round(m.at - marks[0].at)}`)
      .join(", ");
    console.log(
      `boot (attempt ${testInfo.retry + 1}): first stage at ${Math.round(marks[0].at)} ms, scheduled ${scheduled} ms, took ${Math.round(took)} ms; ${offsets}`,
    );
    expect(scheduled, "scheduled ms").toBeGreaterThanOrEqual(4000);
    expect(scheduled, "scheduled ms").toBeLessThanOrEqual(4800);
    expect(took, "the boot took (ms)").toBeGreaterThanOrEqual(scheduled - 50);
    expect(took, "the boot took (ms)").toBeLessThan(6000);
    await expect(page.locator("[data-desktop]")).toBeVisible();
  });
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

// Skip, fast boot, the power cycle and the login card (#14).
//
// One recorder, `record`, runs in the page and writes one entry per animation
// frame into `window.__frames`. It never stops, so a test reads what happened
// between any two moments. Pass it to `page.addInitScript` to trace a load from
// its start, or to `page.evaluate` to trace from now on. Nothing in a test
// sleeps: each wait is a frame in which a condition first holds.

interface Frame {
  at: number;
  /** data-boot-stage, or "gone" once a root has been seen and is removed. */
  stage: string;
  lid: string | null;
  /** The computed transforms of the lid and the camera. */
  lidT: string;
  camT: string;
  /** Printed boot log lines. */
  lines: number;
  /** Shutdown lines whose computed opacity is "1", and the last one's text. */
  shown: number;
  lastShown: string;
  /** Whether the power-on scanlines exist. */
  scan: boolean;
}
type Framed = Window & { __frames?: Frame[]; __framesGen?: number };

function record(): void {
  const w = window as unknown as Framed;
  const frames: Frame[] = (w.__frames = []);
  // A second call starts a new list and stops the first loop.
  const gen = (w.__framesGen = (w.__framesGen ?? 0) + 1);
  let seen = false;
  const tick = () => {
    if (w.__framesGen !== gen) return;
    const root = document.querySelector("[data-boot-stage]");
    if (root) seen = true;
    const stage = root
      ? root.getAttribute("data-boot-stage")
      : seen
        ? "gone"
        : null;
    if (stage !== null) {
      const lid = document.querySelector("[data-laptop-lid]");
      const camera = document.querySelector("[data-laptop-camera]");
      const shown = [
        ...document.querySelectorAll("[data-shutdown-line]"),
      ].filter((el) => getComputedStyle(el).opacity === "1");
      frames.push({
        at: performance.now(),
        stage,
        lid:
          document.querySelector("[data-laptop]")?.getAttribute("data-lid") ??
          null,
        lidT: lid ? getComputedStyle(lid).transform : "",
        camT: camera ? getComputedStyle(camera).transform : "",
        lines: document.querySelectorAll("[data-boot-line]").length,
        shown: shown.length,
        lastShown: shown.at(-1)?.textContent ?? "",
        scan: document.querySelector(".boot-scanlines") !== null,
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const readFrames = (page: Page) =>
  page.evaluate(() => (window as unknown as Framed).__frames ?? []);

/** The boot has ended: the desktop is up, and the recorder has seen it go. */
async function afterBoot(page: Page, timeout = 15_000) {
  await inFrame(page, DESKTOP_UP, timeout);
  await inFrame(
    page,
    () => (window as unknown as Framed).__frames?.at(-1)?.stage === "gone",
    timeout,
  );
}

interface Run {
  stage: string;
  from: number;
  to: number;
}

/** Consecutive frames in one stage, as runs. A leading `off` is dropped. */
function runs(frames: Frame[]): Run[] {
  const out: Run[] = [];
  for (const f of frames) {
    const last = out.at(-1);
    if (last && last.stage === f.stage) last.to = f.at;
    else out.push({ stage: f.stage, from: f.at, to: f.at });
  }
  if (out[0]?.stage === "off") out.shift();
  return out;
}

/** How long run `i` lasted: until the next run's first frame. */
const lasted = (rs: Run[], i: number) =>
  (rs[i + 1]?.from ?? rs[i].to) - rs[i].from;
const lastedOf = (rs: Run[], stage: string) => {
  const i = rs.findIndex((r) => r.stage === stage);
  expect(i, `no ${stage} run`).toBeGreaterThanOrEqual(0);
  return lasted(rs, i);
};

/**
 * A fast boot: the first stage to the desktop is quick (a full boot takes 4400
 * ms or more), the log is never drawn, and it fades from black.
 *
 * Scheduled time is checked on the app's own clock, first: contract 4.3 says
 * every boot stage is 0 ms and desktop-enter 400, and no host can stretch that.
 * A 0 ms stage still lasts a frame, and a frame took 134 to 188 ms on a loaded
 * host (#124), so the wall time is checked in frames, with room, below.
 */
async function expectFastBoot(page: Page) {
  expect((await bootMarks(page)).map((m) => [m.stage, m.mode, m.ms])).toEqual([
    ["lid-opening", "fast", 0],
    ["power-on", "fast", 0],
    ["firmware", "fast", 0],
    ["boot-log", "fast", 0],
    ["desktop-enter", "fast", 400],
    ["desktop", "fast", null],
  ]);

  const frames = await readFrames(page);
  const rs = runs(frames);
  const gone = rs.find((r) => r.stage === "gone");
  expect(rs.length, "no boot stage was recorded").toBeGreaterThan(1);
  expect(gone, "the boot never ended").toBeDefined();
  expect(gone!.from - rs[0].from).toBeLessThanOrEqual(1500);
  const enter = lastedOf(rs, "desktop-enter");
  expect(enter).toBeGreaterThanOrEqual(300);
  expect(enter).toBeLessThanOrEqual(1000);
  expect(frames.filter((f) => f.lines > 0)).toHaveLength(0);
}

const touching = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
type Rect = { x: number; y: number; width: number; height: number };

/** Opens the System menu and chooses one of its items. */
async function choose(page: Page, item: string) {
  await page.getByRole("button", { name: "System menu" }).click();
  await page
    .getByRole("dialog", { name: "System menu" })
    .getByRole("menuitem", { name: item })
    .click();
}

// The name comes from the content package, as desktop.spec.ts reads it.
const { profile } = content;

const BOOTED = "beselfos:booted";
const setBooted = () => window.sessionStorage.setItem("beselfos:booted", "1");
const hello = (page: Page) => page.locator('[data-window-id="hello"]');
const powerButton = (page: Page) =>
  page.getByRole("button", { name: "Power on" });
const AT_BOOT_LOG = () =>
  document.querySelector('[data-boot-stage="boot-log"]') !== null;

test.describe("skipping the boot", () => {
  test("Space during the boot lands on the desktop in under 1 s", async ({
    page,
  }) => {
    await page.goto("/");
    await inFrame(page, AT_BOOT_LOG);
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press("Space");
    const t1 = await inFrame(page, DESKTOP_UP, 5000);
    expect(t1).toBeLessThan(t0 + 1000);
    await expect(page.locator("[data-desktop]")).toBeVisible();
    await expect(page.locator("[data-boot-stage]")).toHaveCount(0);
  });

  test("a press on the screen skips", async ({ page }) => {
    await page.goto("/");
    await inFrame(page, AT_BOOT_LOG);
    const box = await rect(page.locator("[data-screen-box]"));
    const t0 = await page.evaluate(() => performance.now());
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const t1 = await inFrame(page, DESKTOP_UP, 5000);
    expect(t1).toBeLessThan(t0 + 1000);
    await expect(page.locator("[data-boot-stage]")).toHaveCount(0);
  });

  test.describe("on a touch screen", () => {
    test.use({ hasTouch: true });

    test("a tap skips", async ({ page }) => {
      // The viewport is landscape, so this is still a full boot.
      await page.goto("/");
      await inFrame(page, AT_BOOT_LOG);
      const box = await rect(page.locator("[data-screen-box]"));
      const t0 = await page.evaluate(() => performance.now());
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      const t1 = await inFrame(page, DESKTOP_UP, 5000);
      expect(t1).toBeLessThan(t0 + 1000);
      await expect(page.locator("[data-boot-stage]")).toHaveCount(0);
    });
  });

  test("the firmware screen says which key", async ({ page }) => {
    await page.goto("/");
    await inFrame(
      page,
      () => document.querySelector('[data-boot-stage="firmware"]') !== null,
    );
    await expect(page.getByText("Press any key to skip")).toBeVisible();
  });
});

test.describe("fast boot", () => {
  test("reloading the same tab fast-boots", async ({ page }) => {
    await page.addInitScript(record);
    await page.goto("/");
    await inFrame(page, DESKTOP_UP);
    await expect
      .poll(() => page.evaluate((key) => sessionStorage.getItem(key), BOOTED))
      .toBe("1");

    await page.reload();
    await afterBoot(page);
    await expectFastBoot(page);
  });

  test("?boot=full beats the session flag and a deep link", async ({
    page,
  }) => {
    await page.addInitScript(setBooted);
    await page.addInitScript(record);
    await page.goto("/?app=hello&boot=full");
    await afterBoot(page);

    const frames = await readFrames(page);
    const rs = runs(frames);
    expect(lastedOf(rs, "boot-log")).toBeGreaterThanOrEqual(2150);
    expect(Math.max(...frames.map((f) => f.lines))).toBeGreaterThanOrEqual(10);
    await expect(hello(page)).toBeVisible();
  });

  test("a deep link fast-boots a fresh tab", async ({ page }) => {
    await page.addInitScript(record);
    await page.goto("/?app=hello");
    await afterBoot(page);
    await expectFastBoot(page);
    await expect(hello(page)).toBeVisible();
  });

  test("a phone fast-boots (D4)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(record);
    await page.goto("/");
    await afterBoot(page);
    await expectFastBoot(page);
  });

  test("reduced motion fast-boots, and a forced full boot has no lid or CRT motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(record);
    await page.goto("/");
    await afterBoot(page);
    await expectFastBoot(page);

    // The flag is set by now, and ?boot=full overrides it.
    await page.goto("/?boot=full");
    await afterBoot(page);
    const frames = await readFrames(page);
    const opening = frames.filter((f) => f.stage === "lid-opening");
    expect(opening.length).toBeGreaterThan(0);
    // The first frames of a stage are left out: motion writes an instant pose
    // on its next frame.
    const settled = opening.filter((f) => f.at >= opening[0].at + 100);
    expect(settled.length).toBeGreaterThan(0);
    for (const f of settled) {
      expect(f.lidT).toBe("none");
      expect(f.camT).toBe("none");
    }
    expect(frames.filter((f) => f.scan)).toHaveLength(0);
    expect(lastedOf(runs(frames), "boot-log")).toBeGreaterThanOrEqual(2150);
  });
});

test.describe("the power cycle", () => {
  test("Power Off shows the shutdown, closes the lid, and the power button boots again", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?boot=skip");
    await inFrame(page, DESKTOP_UP);
    await page.evaluate(record);

    await choose(page, "Power Off");
    await inFrame(page, () => {
      const button = document.querySelector("[data-power-button]");
      return button !== null && getComputedStyle(button).opacity === "1";
    });
    await expect(page.locator("[data-desktop]")).toHaveCount(0);

    const frames = await readFrames(page);
    const rs = runs(frames);
    expect(rs.map((r) => r.stage)).toEqual(["shutting-down", "off"]);
    const down = lasted(rs, 0);
    expect(down, `shutting-down lasted ${down} ms`).toBeGreaterThanOrEqual(550);
    expect(down).toBeLessThanOrEqual(1000);

    // The shutdown lines appear one by one and stay.
    const during = frames.filter((f) => f.stage === "shutting-down");
    expect(during[0].shown).toBeLessThanOrEqual(1);
    for (const [i, f] of during.entries()) {
      if (i > 0) expect(f.shown).toBeGreaterThanOrEqual(during[i - 1].shown);
    }
    expect(
      during.some((f) => f.shown === 3 && f.lastShown === "reboot: Power down"),
    ).toBe(true);

    // The lid is closed from the first frame of off, and it moves while it
    // closes: a snap would leave no frame in between.
    const off = frames.filter((f) => f.stage === "off");
    for (const f of off) expect(f.lid).toBe("closed");
    const final = off.at(-1)!;
    expect(final.lidT).not.toBe("none");
    const between = off.filter(
      (f) => f.at >= off[0].at + 150 && f.at <= off[0].at + 600,
    );
    expect(between.some((f) => f.lidT !== final.lidT)).toBe(true);

    // The button has focus and stands clear of the closed laptop.
    await expect(powerButton(page)).toBeFocused();
    const button = await rect(powerButton(page));
    const lid = await rect(page.locator("[data-laptop-lid]"));
    expect(touching(button, lid), "the button is over the laptop").toBe(false);

    // The button is a full boot, lid included.
    const t0 = await page.evaluate(() => performance.now());
    await powerButton(page).click();
    const t1 = await inFrame(page, DESKTOP_UP, 15_000);
    expect(t1 - t0).toBeGreaterThanOrEqual(4000);
    expect(t1 - t0).toBeLessThanOrEqual(6500);

    const again = await readFrames(page);
    const opening = again.filter((f) => f.stage === "lid-opening");
    expect(opening.length).toBeGreaterThan(0);
    for (const f of opening) expect(f.lid).toBe("opening");
    await afterBoot(page);
    expect(
      lastedOf(runs(await readFrames(page)), "boot-log"),
    ).toBeGreaterThanOrEqual(2150);
  });

  test("after Power Off on a phone the power button is in the middle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?boot=skip");
    await inFrame(page, DESKTOP_UP);
    await choose(page, "Power Off");
    await inFrame(
      page,
      () => document.querySelector("[data-power-button]") !== null,
    );

    await expect(powerButton(page)).toBeFocused();
    const box = await rect(powerButton(page));
    expect(Math.abs(box.x + box.width / 2 - 195)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.y + box.height / 2 - 422)).toBeLessThanOrEqual(2);
  });

  test("Restart replays the full boot with the lid open", async ({ page }) => {
    // A fast boot first, so the mode before the restart is "fast".
    await page.addInitScript(setBooted);
    await page.goto("/");
    await inFrame(page, DESKTOP_UP);
    await page.evaluate(record);

    await choose(page, "Restart");
    await afterBoot(page);

    const frames = await readFrames(page);
    const rs = runs(frames);
    expect(rs.map((r) => r.stage)).toEqual([
      "restarting",
      "power-on",
      "firmware",
      "boot-log",
      "desktop-enter",
      "gone",
    ]);
    const restarting = lasted(rs, 0);
    expect(restarting).toBeGreaterThanOrEqual(550);
    expect(restarting).toBeLessThanOrEqual(1000);
    expect(
      frames.some(
        (f) =>
          f.stage === "restarting" &&
          f.lastShown === "reboot: Restarting system",
      ),
    ).toBe(true);
    expect(lastedOf(rs, "boot-log")).toBeGreaterThanOrEqual(2150);
    for (const f of frames) {
      expect(f.lid).toBe("open");
      expect(f.lidT).toBe("none");
      expect(f.camT).toBe("none");
    }
  });

  test("the server HTML has no power button", async ({ page }) => {
    const html = await (await page.request.get("/")).text();
    expect(html).toContain('data-boot-stage="off"');
    expect(html).not.toContain("data-power-button");
  });
});

test.describe("the login stage", () => {
  test("with showLogin on, the login card waits for a click", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "beselfos:settings",
        JSON.stringify({
          state: { settings: { showLogin: true } },
          version: 0,
        }),
      );
    });
    await page.goto("/?boot=fast");
    await inFrame(
      page,
      () => document.querySelector('[data-boot-stage="login"]') !== null,
    );
    await expect(
      page.getByRole("button", { name: `${profile.name} Click to log in` }),
    ).toBeFocused();

    // A second of frames, with no timer in the way: it is still the login.
    const start = await page.evaluate(() => performance.now());
    await page.waitForFunction((t) => performance.now() - t >= 1000, start, {
      polling: "raf",
    });
    await expect(page.locator('[data-boot-stage="login"]')).toHaveCount(1);

    await page.keyboard.press("Enter");
    await inFrame(page, DESKTOP_UP, 2000);
  });

  test("with showLogin on, Lock shows the login card and the card brings the desktop back", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "beselfos:settings",
        JSON.stringify({
          state: { settings: { showLogin: true } },
          version: 0,
        }),
      );
    });
    // Skip passes over the login on the way in, so the only login is Lock's.
    await page.goto("/?app=hello&boot=skip");
    await inFrame(page, DESKTOP_UP);
    await expect(hello(page)).toBeVisible();

    await choose(page, "Lock");
    await expect(page.locator('[data-boot-stage="login"]')).toBeVisible();
    const card = page.getByRole("button", {
      name: `${profile.name} Click to log in`,
    });
    await expect(card).toBeFocused();
    await expect(page.locator("[data-desktop]")).toHaveCount(0);

    await card.click();
    await inFrame(page, DESKTOP_UP, 2000);
    await expect(hello(page)).toBeVisible();

    // Lock locked, so it pushed no notice.
    await page.locator("[data-clock]").click();
    const calendar = page.getByRole("dialog", {
      name: "Calendar and notifications",
    });
    await expect(calendar).toBeVisible();
    await expect(calendar).not.toContainText("Locking is not available.");
  });

  test("with showLogin off, Lock leaves the desktop up and lists the notice", async ({
    page,
  }) => {
    await page.goto("/?app=hello&boot=skip");
    await inFrame(page, DESKTOP_UP);
    await expect(hello(page)).toBeVisible();

    await choose(page, "Lock");
    // The clock is part of the desktop, so reaching it shows Lock did not lock.
    await page.locator("[data-clock]").click();
    await expect(
      page.getByRole("list", { name: "Notifications" }),
    ).toContainText("Locking is not available.");
    await expect(page.locator("[data-boot-stage]")).toHaveCount(0);
    await expect(hello(page)).toBeVisible();
  });
});
