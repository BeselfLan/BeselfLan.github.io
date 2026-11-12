import { expect, test, type Page } from "@playwright/test";

test("the composed page renders with tokens and fonts, no console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  // The boot has run and the desktop is up, so a late error would show.
  await expect(page.locator("[data-desktop]")).toBeVisible({ timeout: 15_000 });

  // Visually hidden, so attached rather than visible.
  await expect(
    page.getByRole("heading", { level: 1, name: /BeselfOS/ }),
  ).toBeAttached();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(44, 0, 30)",
  );
  await expect(page.locator("body")).toHaveCSS("font-family", /Ubuntu/);

  const vars = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      orange: root.getPropertyValue("--os-orange").trim().toLowerCase(),
      mono: root.getPropertyValue("--font-mono"),
    };
  });
  expect(vars.orange).toBe("#e95420");
  expect(vars.mono).toMatch(/Ubuntu.Mono/);

  expect(errors).toEqual([]);
});

// The dev-only /e2e-css/ route (#86) holds a CSS Module class, a bare class of
// the same name, and a Tailwind utility. Under the Tailwind-only Turbopack rule
// a module lost its scoping: its class map came out empty and `.probe` painted
// every element with that class.
test("CSS Modules are scoped, and Tailwind still compiles", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/e2e-css/");
  const moduleProbe = page.locator("[data-css-module-probe]");
  const rawProbe = page.locator("[data-css-raw-probe]");
  const tailwindProbe = page.locator("[data-tailwind-probe]");
  await expect(moduleProbe).toBeVisible();

  // The import is a real class map: a hashed name, not `probe` and not empty.
  const className = await moduleProbe.getAttribute("class");
  expect(className ?? "").not.toBe("");
  expect(className).not.toBe("probe");
  await expect(moduleProbe).toHaveCSS("color", "rgb(1, 2, 3)");
  // The module's selector is hashed, so the bare class does not match it.
  await expect(rawProbe).not.toHaveCSS("color", "rgb(1, 2, 3)");
  // Tailwind still compiles on the global stylesheet: --os-orange.
  await expect(tailwindProbe).toHaveCSS("color", "rgb(233, 84, 32)");

  expect(errors).toEqual([]);
});

// Playwright's touchscreen only taps, so send the touch events directly. Copied
// from touchDrag in window.spec.ts: specs share no helpers, and one importing
// another is fragile.
async function touchSwipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const cdp = await page.context().newCDPSession(page);
  const send = (
    type: "touchStart" | "touchMove" | "touchEnd",
    x: number,
    y: number,
  ) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  await send("touchStart", from.x, from.y);
  for (let i = 1; i <= 6; i++) {
    await send(
      "touchMove",
      from.x + ((to.x - from.x) * i) / 6,
      from.y + ((to.y - from.y) * i) / 6,
    );
  }
  await send("touchEnd", to.x, to.y);
  await cdp.detach();
}

// Android Chrome has no pull-to-refresh to give, which would reload the page
// and reboot the OS, and iOS has no bounce, because the page never scrolls.
test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("a phone page never scrolls", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    // The welcome toast would sit on the wallpaper the swipe starts on.
    await page.addInitScript(() =>
      sessionStorage.setItem("beselfos:welcomed", "1"),
    );
    await page.goto("/?boot=skip");
    await expect(page.locator("[data-desktop]")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-boot-stage]")).toHaveCount(0);

    // With no rule the computed value is "auto".
    const overscroll = await page.evaluate(() => ({
      root: getComputedStyle(document.documentElement).overscrollBehaviorY,
      body: getComputedStyle(document.body).overscrollBehaviorY,
    }));
    expect(overscroll).toEqual({ root: "none", body: "none" });

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

    // Down the wallpaper and back up again.
    await touchSwipe(page, { x: 195, y: 300 }, { x: 195, y: 700 });
    await touchSwipe(page, { x: 195, y: 700 }, { x: 195, y: 300 });

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const box = await page.locator("[data-screen-box]").boundingBox();
    expect(Math.abs(box?.y ?? NaN)).toBeLessThanOrEqual(1);

    expect(errors).toEqual([]);
  });
});
