import { content } from "@beself/content";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The desktop: top bar, wallpaper, clock, popovers and the dock. Every test
// starts from openDesktop, which returns only once the boot is over. The
// dock's tests open apps by clicking their icons.
//
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

const dock = (page: Page) => page.locator("[data-dock]");
const dockIcon = (page: Page, id: string) =>
  page.locator(`[data-dock-app="${id}"]`);

/**
 * Waits for the desktop to show, with room for a full boot (#74), and then for
 * the boot to finish. The desktop is mounted during desktop-enter while the
 * boot overlay fades for 400 ms, and the stage table accepts Restart and Power
 * Off only from desktop, the one stage where BootSequence renders nothing.
 */
async function openDesktop(page: Page) {
  await page.goto("/");
  await expect(page.locator("[data-desktop]")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-boot-stage]")).toHaveCount(0, {
    timeout: 5_000,
  });
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

test.describe("the popovers", () => {
  const systemMenu = (page: Page) =>
    page.getByRole("dialog", { name: "System menu" });
  const calendar = (page: Page) =>
    page.getByRole("dialog", { name: "Calendar and notifications" });

  /** Opens the System menu and chooses one of its items. */
  async function choose(page: Page, item: string) {
    await page.getByRole("button", { name: "System menu" }).click();
    await systemMenu(page).getByRole("menuitem", { name: item }).click();
  }

  test("the calendar opens under the clock, inside the screen", async ({
    page,
  }) => {
    // The scale is about 0.889 here and the box is about 60 px from the left,
    // so a popover portalled to the body would land visibly off.
    await page.setViewportSize({ width: 1400, height: 800 });
    await openDesktop(page);

    const clock = page.locator("[data-clock]");
    await clock.click();
    await expect(calendar(page)).toBeVisible();

    // The bar slides in over 300 ms and the popover is placed from the rect
    // the click read, so check the settled boxes.
    await expect(async () => {
      const box = await rect(page.locator("[data-screen-box]"));
      const bar = await rect(page.locator("[data-topbar]"));
      const c = await rect(clock);
      const d = await rect(calendar(page));
      expect(d.x).toBeGreaterThanOrEqual(box.x - 1);
      expect(d.y).toBeGreaterThanOrEqual(bar.y + bar.height - 0.5);
      expect(d.x + d.width).toBeLessThanOrEqual(box.x + box.width + 1);
      expect(d.y + d.height).toBeLessThanOrEqual(box.y + box.height + 1);
      // Centred under the clock, whatever the scale.
      expect(Math.abs(d.x + d.width / 2 - (c.x + c.width / 2))).toBeLessThan(2);
    }).toPass();

    await page.keyboard.press("Escape");
    await expect(calendar(page)).toHaveCount(0);
    await expect(clock).toBeFocused();

    // A press on the wallpaper, well away from the calendar, closes it too.
    await clock.click();
    await expect(calendar(page)).toBeVisible();
    const box = await rect(page.locator("[data-screen-box]"));
    const s = box.width / 1440;
    await page.mouse.click(box.x + 300 * s, box.y + 600 * s);
    await expect(calendar(page)).toHaveCount(0);
  });

  test("Settings lands in the calendar list", async ({ page }) => {
    await openDesktop(page);
    await page.getByRole("button", { name: "System menu" }).click();
    // A pattern, so #18 does not have to edit this test.
    await expect(systemMenu(page)).toContainText(
      /Media server: (unknown|online|offline)/,
    );
    await systemMenu(page).getByRole("menuitem", { name: "Settings" }).click();
    await expect(systemMenu(page)).toHaveCount(0);

    await page.locator("[data-clock]").click();
    const list = page.getByRole("list", { name: "Notifications" });
    await expect(list).toContainText("Settings");
    await expect(list).toContainText("The Settings app is coming soon.");
  });

  test("Restart replays the boot", async ({ page }) => {
    await openDesktop(page);
    await choose(page, "Restart");
    await expect(page.locator("[data-desktop]")).toHaveCount(0);
    await expect(page.locator('[data-boot-stage="boot-log"]')).toBeAttached({
      timeout: 10_000,
    });
    await expect(page.locator("[data-desktop]")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Power Off shuts down", async ({ page }) => {
    await openDesktop(page);
    await choose(page, "Power Off");
    await expect(page.locator("[data-desktop]")).toHaveCount(0, {
      timeout: 2_000,
    });
    await expect(page.locator('[data-boot-stage="off"]')).toBeAttached({
      timeout: 2_000,
    });
    // The screen stays black here. The power button that boots again is
    // tested in boot.spec.ts ("the power cycle"), so the test ends here.
  });
});

test.describe("the dock", () => {
  const frame = (page: Page, id: string) =>
    page.locator(`[data-window-id="${id}"]`);
  const menu = (page: Page) => page.getByRole("menu");

  async function centre(locator: Locator) {
    const box = await rect(locator);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  test("replaces the launcher", async ({ page }) => {
    await openDesktop(page);
    await expect(page.locator('nav[aria-label="Apps"]')).toHaveCount(0);
    await expect(dock(page)).toBeVisible();

    const ids = await page
      .locator("[data-dock-app]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-dock-app")));
    expect(ids).toEqual(["projects", "skills", "about"]);

    // A missing file would fail the test through its console error as well.
    for (const id of ids) {
      const img = dockIcon(page, id!).locator("img");
      await expect
        .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
        .toBeGreaterThan(0);
    }
    await expect(
      dock(page).getByRole("button", { name: "Show Applications" }),
    ).toBeVisible();
  });

  test("runs down the left under the top bar on a laptop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openDesktop(page);
    await expect(dock(page)).toHaveAttribute("data-dock-side", "left");

    // The dock slides in over 300 ms, so wait until it has settled.
    await expect(async () => {
      const box = await rect(page.locator("[data-screen-box]"));
      const bar = await rect(page.locator("[data-topbar]"));
      const d = await rect(dock(page));
      const scale = box.width / 1440;
      expect(Math.abs(d.x - box.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(d.y - (bar.y + bar.height))).toBeLessThanOrEqual(1);
      expect(
        Math.abs(d.y + d.height - (box.y + box.height)),
      ).toBeLessThanOrEqual(1);
      // 64 screen units, whatever the scale.
      expect(Math.abs(d.width / scale - 64)).toBeLessThanOrEqual(1);
    }).toPass();
  });

  test("sits at the bottom in fullscreen mode, and its menu opens upwards", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDesktop(page);
    await expect(dock(page)).toHaveAttribute("data-dock-side", "bottom");

    await expect(async () => {
      const d = await rect(dock(page));
      expect(Math.abs(d.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(d.width - 390)).toBeLessThanOrEqual(1);
      expect(Math.abs(d.y + d.height - 844)).toBeLessThanOrEqual(1);
      expect(Math.abs(d.height - 64)).toBeLessThanOrEqual(1);
    }).toPass();

    const projects = dockIcon(page, "projects");
    await projects.click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    // A menu that never flipped would be clamped over its own icon.
    await expect(async () => {
      const m = await rect(menu(page));
      const i = await rect(projects);
      expect(m.y + m.height).toBeLessThanOrEqual(i.y + 1);
    }).toPass();
  });

  test("a click toggles minimise and restore", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openDesktop(page);
    const projects = dockIcon(page, "projects");
    const win = frame(page, "projects");

    await projects.click();
    await expect(win).toBeVisible();
    await expect(win).toHaveAttribute("data-focused", "");
    await expect(projects).toHaveAttribute("data-running", "");

    await projects.click();
    await expect(win).toBeHidden();
    // It ended on the dock icon, not where it was.
    await expect(async () => {
      const icon = await centre(projects);
      const ended = await centre(win.locator(":scope > div"));
      expect(Math.abs(ended.x - icon.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(ended.y - icon.y)).toBeLessThanOrEqual(2);
    }).toPass();
    await expect(projects).toHaveAttribute("data-running", "");

    await projects.click();
    await expect(win).toBeVisible();
    await expect(win).toHaveAttribute("data-focused", "");
  });

  test("a click on an unfocused app focuses it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openDesktop(page);
    await dockIcon(page, "projects").click();
    await dockIcon(page, "skills").click();
    await expect(frame(page, "skills")).toHaveAttribute("data-focused", "");
    await expect(frame(page, "projects")).not.toHaveAttribute("data-focused");

    await dockIcon(page, "projects").click();
    await expect(frame(page, "projects")).toHaveAttribute("data-focused", "");
    // One click raised it, and nothing was minimised.
    await expect(frame(page, "projects")).toBeVisible();
    await expect(frame(page, "skills")).toBeVisible();
    await expect(frame(page, "skills")).not.toHaveAttribute("data-focused");
  });

  test("the tooltip names the app", async ({ page }) => {
    await openDesktop(page);
    await dockIcon(page, "projects").hover();
    await expect(page.getByRole("tooltip")).toHaveText("Projects");
  });

  test("right-click shows the dock menu, and Esc closes it", async ({
    page,
  }) => {
    await openDesktop(page);
    const projects = dockIcon(page, "projects");

    await projects.click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    await expect(
      menu(page).getByRole("menuitem", { name: "Unpin" }),
    ).toBeVisible();
    await expect(
      menu(page).getByRole("menuitem", { name: "Quit" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);

    // Quit closes the app's window, and the running dot goes.
    await projects.click();
    await expect(frame(page, "projects")).toBeVisible();
    await expect(projects).toHaveAttribute("data-running", "");
    await projects.click({ button: "right" });
    await menu(page).getByRole("menuitem", { name: "Quit" }).click();
    await expect(frame(page, "projects")).toHaveCount(0);
    await expect(projects).not.toHaveAttribute("data-running");
    await expect(menu(page)).toHaveCount(0);

    // Unpin says it is coming soon, in the calendar's list for now.
    await projects.click({ button: "right" });
    await menu(page).getByRole("menuitem", { name: "Unpin" }).click();
    await expect(menu(page)).toHaveCount(0);
    await page.locator("[data-clock]").click();
    await expect(
      page.getByRole("list", { name: "Notifications" }),
    ).toContainText("Unpinning apps is coming soon.");
  });
});
