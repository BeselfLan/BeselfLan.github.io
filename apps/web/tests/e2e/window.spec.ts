import { expect, test, type Locator, type Page } from "@playwright/test";
import { axeFindings } from "./axe";

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

export const frame = (page: Page, id: string) =>
  page.locator(`[data-window-id="${id}"]`);

const titleBar = (page: Page, id: string) =>
  frame(page, id).locator("[data-titlebar]");

/** The panel motion animates: the only child of the frame. */
const surface = (page: Page, id: string) =>
  frame(page, id).locator(":scope > div");

async function centre(locator: Locator) {
  const box = await rect(locator);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Presses a title bar button in the page and waits one animation frame, then
 * reports whether the frame is still attached and its computed visibility. A
 * fade is longer than a frame, so it has not ended yet.
 */
function pressAndWaitFrame(page: Page, id: string, label: string) {
  return page.evaluate(
    async ([windowId, name]) => {
      const el = document.querySelector(`[data-window-id="${windowId}"]`)!;
      el.querySelector<HTMLElement>(`[aria-label="${name}"]`)!.click();
      await new Promise(requestAnimationFrame);
      return {
        attached: el.isConnected,
        visibility: getComputedStyle(el).visibility,
      };
    },
    [id, label],
  );
}

/** The id of the window under a client point, or null. */
async function topWindowAt(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) =>
      document
        .elementFromPoint(px, py)
        ?.closest("[data-window-id]")
        ?.getAttribute("data-window-id") ?? null,
    [x, y],
  );
}

export async function open(
  page: Page,
  width: number,
  height: number,
  scale: number,
  path = "/e2e-harness/",
) {
  // Below 900 px the screen is fullscreen: the box is the viewport, 1:1.
  const boxWidth = width < 900 ? width : 1440 * scale;
  await page.setViewportSize({ width, height });
  await page.goto(path);
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
  await expect(boxEl.locator("..")).toHaveCSS("overflow", "hidden");
});

test("the screen letterboxes vertically", async ({ page }) => {
  await open(page, 960, 800, 2 / 3);
  const box = await rect(page.locator("[data-screen-box]"));
  expect(box.width).toBeCloseTo(960, 0);
  expect(box.height).toBeCloseTo(600, 0);
  expect(box.x).toBeCloseTo(0, 0);
  expect(box.y).toBeCloseTo(100, 0);
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
  await expect(frame(page, "alpha")).toBeVisible();
  await expect(frame(page, "beta")).toBeVisible();
  // The window is 400 wide, so its width proves the scale it renders at.
  await expect(async () => {
    const alpha = await rect(frame(page, "alpha"));
    expect(alpha.width).toBeCloseTo(400 * scale, 0);
  }).toPass();
}

async function expectMovedBy(
  page: Page,
  before: { x: number; y: number },
  dx: number,
  dy: number,
) {
  await expect(async () => {
    const now = await rect(frame(page, "alpha"));
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
    const before = await rect(frame(page, "alpha"));
    await mouseDrag(page, titleBar(page, "alpha"), 150, 90);
    await expectMovedBy(page, before, 150, 90);
  });
}

test.describe("touch", () => {
  test.use({ hasTouch: true });

  test("a touch drag tracks the pointer", async ({ page }) => {
    await openWindow(page, 960, 600, 2 / 3);
    const handle = titleBar(page, "alpha");
    await expect(handle).toHaveCSS("touch-action", "none");
    const before = await rect(frame(page, "alpha"));
    await touchDrag(page, handle, 150, 90);
    await expectMovedBy(page, before, 150, 90);
  });
});

test("the clamp holds in the browser", async ({ page }) => {
  await openWindow(page, 960, 600, 2 / 3);
  const handle = titleBar(page, "alpha");
  const box = await rect(handle);
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(955, 595, { steps: 6 });
  await page.mouse.up();
  // 1400 and 860 screen units at scale 2/3.
  await expect(async () => {
    const now = await rect(frame(page, "alpha"));
    expect(Math.abs(now.x - 933.3)).toBeLessThanOrEqual(1);
    expect(Math.abs(now.y - 573.3)).toBeLessThanOrEqual(1);
  }).toPass();
});

test("a press raises the back window", async ({ page }) => {
  await openWindow(page, 960, 600, 2 / 3);
  const alpha = await rect(frame(page, "alpha"));
  const beta = await rect(frame(page, "beta"));
  const x = (beta.x + alpha.x + alpha.width) / 2;
  const y = (beta.y + alpha.y + alpha.height) / 2;
  expect(await topWindowAt(page, x, y)).toBe("beta");
  // The empty bottom left of Alpha, clear of Beta.
  await page.mouse.click(alpha.x + 20, alpha.y + alpha.height - 20);
  await expect.poll(() => topWindowAt(page, x, y)).toBe("alpha");
});

test("a press on the empty desktop reaches the desktop", async ({ page }) => {
  await openWindow(page, 960, 600, 2 / 3);
  const box = await rect(page.locator("[data-screen-box]"));
  const s = box.width / 1440;
  const hit = await page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return {
        testId: el?.getAttribute("data-testid") ?? null,
        inLayer: el?.closest("[data-window-layer]") != null,
      };
    },
    [box.x + 1200 * s, box.y + 800 * s],
  );
  expect(hit).toEqual({ testId: "harness-desktop", inLayer: false });
});

test("minimise and restore keep the app's state, and close removes it", async ({
  page,
}) => {
  await openWindow(page, 960, 600, 2 / 3);
  const alpha = frame(page, "alpha");
  const counter = alpha.getByRole("button", { name: /Pressed/ });
  for (let i = 0; i < 3; i++) await counter.click();
  await expect(counter).toHaveText("Pressed 3");

  await alpha.getByRole("button", { name: "Minimise" }).click();
  await expect(alpha).toBeHidden();
  await page.getByRole("button", { name: "Open Alpha" }).click();
  await expect(alpha).toBeVisible();
  await expect(counter).toHaveText("Pressed 3");

  // A button press must not start a drag, or the click lands on the bar.
  await alpha.getByRole("button", { name: "Close" }).click();
  await expect(frame(page, "alpha")).toHaveCount(0);
  await page.getByRole("button", { name: "Open Alpha" }).click();
  await expect(counter).toHaveText("Pressed 0");
});

test("minimise and restore round trip with animation", async ({ page }) => {
  await openWindow(page, 960, 600, 2 / 3);
  const alpha = frame(page, "alpha");
  const before = await rect(alpha);

  // One frame after the press the window is still drawn, so it is animating.
  const midway = await pressAndWaitFrame(page, "alpha", "Minimise");
  expect(midway).toEqual({ attached: true, visibility: "visible" });
  await expect(alpha).toBeHidden();
  // It ended on the dock icon, not where it was.
  const icon = await centre(page.getByTestId("harness-dock-icon"));
  const ended = await centre(surface(page, "alpha"));
  expect(Math.abs(ended.x - icon.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(ended.y - icon.y)).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "Open Alpha" }).click();
  await expect(async () => {
    const outer = await rect(alpha);
    const inner = await rect(surface(page, "alpha"));
    for (const k of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(outer[k] - before[k])).toBeLessThanOrEqual(1);
      expect(Math.abs(inner[k] - outer[k])).toBeLessThanOrEqual(1);
    }
  }).toPass();
  await expect(alpha).toBeVisible();
});

test("minimise without an icon fades in place", async ({ page }) => {
  await openWindow(page, 960, 600, 2 / 3);
  const midway = await pressAndWaitFrame(page, "beta", "Minimise");
  expect(midway.visibility).toBe("visible");
  await expect(frame(page, "beta")).toBeHidden();
  const outer = await centre(frame(page, "beta"));
  const inner = await centre(surface(page, "beta"));
  expect(Math.abs(inner.x - outer.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(inner.y - outer.y)).toBeLessThanOrEqual(1);
});

test("close fades out", async ({ page }) => {
  await openWindow(page, 960, 600, 2 / 3);
  const midway = await pressAndWaitFrame(page, "alpha", "Close");
  // Still in the document for the fade.
  expect(midway.attached).toBe(true);
  await expect(frame(page, "alpha")).toHaveCount(0, { timeout: 500 });
});

test("reduced motion fades in place", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWindow(page, 960, 600, 2 / 3);
  // Alpha has an icon, and still does not fly to it.
  await frame(page, "alpha").getByRole("button", { name: "Minimise" }).click();
  await expect(frame(page, "alpha")).toBeHidden();
  const outer = await centre(frame(page, "alpha"));
  const inner = await centre(surface(page, "alpha"));
  expect(Math.abs(inner.x - outer.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(inner.y - outer.y)).toBeLessThanOrEqual(1);
});

test("maximise fills the work area", async ({ page }) => {
  await openWindow(page, 960, 600, 2 / 3);
  const box = await rect(page.locator("[data-screen-box]"));
  const s = box.width / 1440;
  const expectRect = async (x: number, y: number, w: number, h: number) => {
    await expect(async () => {
      const now = await rect(frame(page, "alpha"));
      expect(Math.abs(now.x - (box.x + x * s))).toBeLessThanOrEqual(1);
      expect(Math.abs(now.y - (box.y + y * s))).toBeLessThanOrEqual(1);
      expect(Math.abs(now.width - w * s)).toBeLessThanOrEqual(1);
      expect(Math.abs(now.height - h * s)).toBeLessThanOrEqual(1);
    }).toPass();
  };
  await frame(page, "alpha").getByRole("button", { name: "Maximise" }).click();
  await expectRect(64, 32, 1376, 868);
  await frame(page, "alpha").getByRole("button", { name: "Restore" }).click();
  await expectRect(200, 100, 400, 300);
});

test("the title is centred on the bar", async ({ page }) => {
  await openWindow(page, 960, 600, 2 / 3);
  const centres = await titleBar(page, "alpha").evaluate((bar) => {
    const title = bar.querySelector("h2")!;
    const range = document.createRange();
    range.selectNodeContents(title);
    const text = range.getBoundingClientRect();
    const whole = bar.getBoundingClientRect();
    return { text: text.x + text.width / 2, bar: whole.x + whole.width / 2 };
  });
  expect(Math.abs(centres.text - centres.bar)).toBeLessThanOrEqual(1);
});

test("children paint above the frames", async ({ page }) => {
  await openWindow(page, 960, 600, 2 / 3);
  const overlay = page.getByTestId("harness-overlay");
  const inner = await rect(overlay);
  const beta = await rect(frame(page, "beta"));
  expect(inner.x).toBeGreaterThanOrEqual(beta.x);
  expect(inner.y).toBeGreaterThanOrEqual(beta.y);
  expect(inner.x + inner.width).toBeLessThanOrEqual(beta.x + beta.width);
  expect(inner.y + inner.height).toBeLessThanOrEqual(beta.y + beta.height);
  const hit = await page.evaluate(
    ([px, py]) =>
      document.elementFromPoint(px, py)?.getAttribute("data-testid") ?? null,
    [inner.x + inner.width / 2, inner.y + inner.height / 2],
  );
  expect(hit).toBe("harness-overlay");
});

// The kernel with the real registry and the Hello app (#67). /e2e-apps/ has no
// boot and no shell, so the cycle does not depend on the desktop that #16
// replaces; `/` is tested through deep links.

const hello = (page: Page) => frame(page, "hello");

/** The frame has moved by (dx, dy) client px from `before`, within 1 px. */
async function expectFrameMovedBy(
  page: Page,
  id: string,
  before: { x: number; y: number },
  dx: number,
  dy: number,
) {
  await expect(async () => {
    const now = await rect(frame(page, id));
    expect(Math.abs(now.x - before.x - dx)).toBeLessThanOrEqual(1);
    expect(Math.abs(now.y - before.y - dy)).toBeLessThanOrEqual(1);
  }).toPass();
}

async function openHello(page: Page) {
  await open(page, 960, 600, 2 / 3, "/e2e-apps/");
  await page.getByRole("button", { name: "Open Hello" }).click();
  await expect(hello(page)).toBeVisible();
  await expect(
    hello(page).getByRole("heading", { name: /Hello/ }),
  ).toBeVisible();
}

test("Hello opens, drags 200 px, minimises, restores and closes", async ({
  page,
}) => {
  await openHello(page);
  const win = hello(page);
  const before = await rect(win);
  await mouseDrag(page, titleBar(page, "hello"), 200, 0);
  await expectFrameMovedBy(page, "hello", before, 200, 0);

  // Playwright matches names by substring, and Hello has an api.close()
  // button, so the title bar's buttons are matched exactly.
  const counter = win.getByRole("button", { name: /Pressed/ });
  await counter.click();
  await counter.click();
  await expect(counter).toHaveText("Pressed 2");

  await win.getByRole("button", { name: "Minimise", exact: true }).click();
  await expect(win).toBeHidden();
  await page.getByRole("button", { name: "Open Hello" }).click();
  await expect(win).toBeVisible();
  // The app stayed mounted, so its state is still there.
  await expect(counter).toHaveText("Pressed 2");

  await win.getByRole("button", { name: "Close", exact: true }).click();
  await expect(frame(page, "hello")).toHaveCount(0);
  await page.getByRole("button", { name: "Open Hello" }).click();
  await expect(counter).toHaveText("Pressed 0");
});

test("Hello's bounds are its content box", async ({ page }) => {
  await openHello(page);
  const text = await hello(page).locator('[data-readout="bounds"]').innerText();
  expect(text).toBe("480 x 320");
  const [width, height] = text.split(" x ").map(Number);

  // The window scales in on open, so wait for the box to settle.
  const screenBox = page.locator("[data-screen-box]");
  await expect(async () => {
    const scale = (await rect(screenBox)).width / 1440;
    const content = await rect(hello(page).locator("[data-window-content]"));
    expect(Math.abs(content.width / scale - width)).toBeLessThanOrEqual(1);
    expect(Math.abs(content.height / scale - height)).toBeLessThanOrEqual(1);
  }).toPass();
});

test("`/` boots to the desktop", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-desktop]")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-window-id]")).toHaveCount(0);
});

test("a deep link opens its app", async ({ page }) => {
  await page.goto("/?app=hello&name=Ann");
  await expect(hello(page)).toBeVisible({ timeout: 15_000 });
  await expect(
    hello(page).getByRole("heading", { name: "Hello, Ann" }),
  ).toBeVisible();

  // Nothing (a boot overlay of #13) may sit over the title bar.
  const bar = await centre(titleBar(page, "hello"));
  await expect.poll(() => topWindowAt(page, bar.x, bar.y)).toBe("hello");
  const before = await rect(hello(page));
  await mouseDrag(page, titleBar(page, "hello"), 200, 0);
  await expectFrameMovedBy(page, "hello", before, 200, 0);

  await hello(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(frame(page, "hello")).toHaveCount(0);
  // The sync rewrote the URL with replaceState: same page, bare path.
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  expect(new URL(page.url()).search).toBe("");
});

test("an unknown app id is ignored", async ({ page }) => {
  await page.goto("/?app=nope");
  await expect(page.locator("[data-desktop]")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-window-id]")).toHaveCount(0);
  // The afterEach fails the test on any console error.
});

// The portal layer is hidden while it is empty (#156). An empty, visible layer
// covers the screen after every window, so axe's color-contrast rule reads it
// as overlapping the text under it and reports `incomplete` (bgOverlap), which
// is neither a pass nor a fail. The layer keeps its box, because
// ContextMenuHost, Desktop's Shift+F10 fallback and usePlacement measure it.
// Reduced motion, so the window is not caught mid-fade; 1440x900 is scale 1,
// as axe.ts requires.
test.describe("the screen portal (#156)", () => {
  test.use({ reducedMotion: "reduce" });

  test("the empty portal is invisible and keeps the screen's box", async ({
    page,
  }) => {
    await open(page, 1440, 900, 1, "/e2e-apps/");
    const portal = page.locator("[data-screen-portal]");
    await expect(portal).toHaveCSS("visibility", "hidden");
    // evaluate, not rect(): boundingBox() is null for a hidden element.
    expect(
      await portal.evaluate((el: HTMLElement) => [
        el.offsetWidth,
        el.offsetHeight,
      ]),
    ).toEqual([1440, 900]);

    // A child makes it visible, and the child with it.
    await portal.evaluate((el: HTMLElement) => {
      const probe = document.createElement("div");
      probe.dataset.testid = "portal-probe";
      probe.style.cssText =
        "position:absolute;left:10px;top:10px;width:20px;height:20px";
      probe.textContent = "probe";
      el.append(probe);
    });
    await expect(portal).toHaveCSS("visibility", "visible");
    await expect(page.getByTestId("portal-probe")).toBeVisible();

    await portal.evaluate((el: HTMLElement) => {
      el.querySelector("[data-testid=portal-probe]")?.remove();
    });
    await expect(portal).toHaveCSS("visibility", "hidden");
  });

  test("axe measures the text of a window under the portal", async ({
    page,
  }) => {
    await open(page, 1440, 900, 1, "/e2e-apps/");
    await page.getByRole("button", { name: "Open Hello" }).click();
    await expect(
      frame(page, "hello").getByRole("heading", { name: /Hello/ }),
    ).toBeVisible();
    await expect(surface(page, "hello")).toHaveCSS("opacity", "1");

    const report = await axeFindings(page, {
      include: ['[data-window-id="hello"]'],
    });
    expect(report.passes).toContain("color-contrast");
    expect(report.findings).toEqual([]);
  });
});
