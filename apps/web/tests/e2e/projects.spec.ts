import { expect, test, type Locator, type Page } from "@playwright/test";

// The Projects window in Chromium: the chips, the count, the selection and the
// entry icons (#82), and the 3D ring with its buttons and clicks (#94). #95
// and #18 add their own tests to this file.

test.setTimeout(60_000); // The first request compiles the route.
test.use({ viewport: { width: 1440, height: 900 } });

// A missing icon file is a 404 on /icons/, which the browser also logs as a
// console error. Recording the response names the file.
const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("response", (res) => {
    const { pathname } = new URL(res.url());
    if (pathname.startsWith("/icons/") && res.status() >= 400) {
      errors.push(`${res.status()} ${res.url()}`);
    }
  });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const win = (page: Page) => page.locator('[data-window-id="projects"]');

// Opens through the deep link, never through the desktop's stub launcher. The
// app is a lazy chunk, so the window shows a skeleton before the entries.
async function openProjects(page: Page, query = "") {
  await page.goto(`/?app=projects${query}`);
  await expect(win(page)).toBeVisible({ timeout: 15_000 });
  await win(page).locator("[data-entry-id]").first().waitFor();
}

// `exact`: a name is otherwise a case-insensitive substring, and "All" or
// "Projects" would also match other buttons.
const chip = (page: Page, name: string) =>
  win(page)
    .getByRole("group", { name: "Filter" })
    .getByRole("button", { name, exact: true });
const entries = (page: Page) => win(page).locator("[data-entry-id]");
const count = (page: Page) => win(page).locator("[data-count]");

test("a deep link opens Projects on Featured", async ({ page }) => {
  await openProjects(page);
  await expect(chip(page, "Featured")).toHaveAttribute("aria-pressed", "true");
  for (const other of [
    "All",
    "Projects",
    "Hackathons",
    "Experience",
    "Volunteer",
  ]) {
    await expect(chip(page, other)).toHaveAttribute("aria-pressed", "false");
  }
  await expect(count(page)).toHaveText("13 items");
  await expect(entries(page)).toHaveCount(13);
  await expect(entries(page).first()).toHaveAttribute(
    "data-entry-id",
    "bash-shell",
  );
  await expect(win(page).locator("[data-selected]")).toHaveCount(0);
});

test("every icon loads", async ({ page }) => {
  await openProjects(page);
  const images = win(page).locator("img");
  await expect(images).toHaveCount(13);
  await expect
    .poll(() =>
      images.evaluateAll((list) =>
        list.every(
          (img) =>
            (img as HTMLImageElement).complete &&
            (img as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
  // The afterEach fails on a console error or an /icons/ response of 400 or
  // more, so a file that is missing fails twice.
});

test("the chips filter the entries", async ({ page }) => {
  await openProjects(page);

  await chip(page, "Hackathons").click();
  await expect(chip(page, "Hackathons")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(entries(page)).toHaveCount(2);
  await expect(count(page)).toHaveText("2 items");

  await chip(page, "All").click();
  await expect(entries(page)).toHaveCount(23);
  await expect(count(page)).toHaveText("23 items");

  // Pong has no drawn icon: a tile of its initial, and no image.
  const pong = win(page).locator('[data-entry-id="pong"]');
  await expect(pong.locator("[data-icon-tile]")).toHaveText("P");
  await expect(pong.locator("img")).toHaveCount(0);
  // Thirteen drawn icons stay, and ten entries have a tile.
  await expect(win(page).locator("img")).toHaveCount(13);
  await expect(win(page).locator("[data-icon-tile]")).toHaveCount(10);
});

test("an item link selects it", async ({ page }) => {
  await openProjects(page, "&item=pong");
  // Pong is not featured, so the view switches to All.
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(win(page).locator("[data-selected]")).toHaveCount(1);
  await expect(win(page).locator("[data-selected]")).toHaveAttribute(
    "data-entry-id",
    "pong",
  );
});

// The ring (#94). Client px are compared with client px only: the screen is
// scaled at this viewport, so a screen unit is not a client px.

type Box = { x: number; y: number; width: number; height: number };
const centreX = (b: Box) => b.x + b.width / 2;

const stage = (page: Page) => win(page).locator("[data-carousel]");
const ring = (page: Page) => win(page).locator("[data-carousel-ring]");
const entry = (page: Page, id: string) =>
  win(page).locator(`[data-entry-id="${id}"]`);
// The count is followed by the front item's title in hidden text, so a test
// matches the start of the text only.
const indicator = (page: Page) => win(page).locator("[data-carousel-index]");
const button = (page: Page, name: string) =>
  win(page).getByRole("button", { name, exact: true });
const inFront = (page: Page) => win(page).locator("[data-front]");

// Polls until two reads of the box, 100 ms apart, agree within half a pixel.
// Use it after the window opens (its enter animation scales from 0.96 for
// 120 ms) and after every turn of the ring.
async function settle(target: Locator): Promise<Box> {
  const page = target.page();
  let before = await target.boundingBox();
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(100);
        const after = await target.boundingBox();
        const done =
          before !== null &&
          after !== null &&
          Math.abs(before.x - after.x) <= 0.5 &&
          Math.abs(before.y - after.y) <= 0.5 &&
          Math.abs(before.width - after.width) <= 0.5 &&
          Math.abs(before.height - after.height) <= 0.5;
        before = after;
        return done;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  const box = await target.boundingBox();
  if (box === null) throw new Error("the element has no box");
  return box;
}

test("the items face the viewer, with depth", async ({ page }) => {
  await openProjects(page);
  // The stylesheet arrives with the lazy chunk.
  await expect(ring(page)).toHaveCSS("transform-style", "preserve-3d");
  await expect(stage(page)).toHaveCSS("overflow", "hidden");

  const front = await settle(entry(page, "bash-shell"));
  const side = await settle(entry(page, "todo-fullstack"));
  const back = await settle(entry(page, "deadknight"));
  // Index 3 sits 83 degrees round. Without the counter-rotation it would be
  // nearly edge-on.
  expect(side.width).toBeGreaterThanOrEqual(front.width / 2);
  // Index 6 is almost opposite: smaller and faded.
  expect(back.width).toBeLessThan(front.width);
  const opacity = await entry(page, "deadknight").evaluate(
    (el) => getComputedStyle(el).opacity,
  );
  expect(Number(opacity)).toBeLessThan(0.5);
  await expect(entry(page, "bash-shell")).toHaveCSS("opacity", "1");
});

test("the buttons turn the ring", async ({ page }) => {
  await openProjects(page);
  await expect(indicator(page)).toHaveText(/^1 \/ 13\b/);
  await settle(entry(page, "bash-shell"));

  await button(page, "Next item").click();
  await expect(indicator(page)).toHaveText(/^2 \/ 13\b/);
  await expect(inFront(page)).toHaveAttribute("data-entry-id", "tetris-asm");
  const tetris = await settle(entry(page, "tetris-asm"));
  const frame = await settle(stage(page));
  expect(Math.abs(centreX(tetris) - centreX(frame))).toBeLessThanOrEqual(2);

  await button(page, "Previous item").click();
  await expect(indicator(page)).toHaveText(/^1 \/ 13\b/);
  await expect(inFront(page)).toHaveAttribute("data-entry-id", "bash-shell");
});

test("a side item comes to the front when it is clicked", async ({ page }) => {
  await openProjects(page);
  await settle(entry(page, "tetris-asm"));
  await expect(inFront(page)).toHaveAttribute("data-entry-id", "bash-shell");

  await entry(page, "tetris-asm").click();
  await expect(indicator(page)).toHaveText(/^2 \/ 13\b/);
  await expect(entry(page, "tetris-asm")).toHaveAttribute("data-front", "");
  await expect(entry(page, "tetris-asm")).toHaveAttribute("data-selected", "");
  await expect(win(page).locator("[data-selected]")).toHaveCount(1);
});

test("a link to an item brings it to the front", async ({ page }) => {
  await openProjects(page, "&item=tetris-asm");
  await expect(indicator(page)).toHaveText(/^2 \/ 13\b/);
  await expect(inFront(page)).toHaveAttribute("data-entry-id", "tetris-asm");
  await expect(entry(page, "tetris-asm")).toHaveAttribute("data-selected", "");
});

test("a link to an item that is not featured opens All at that item", async ({
  page,
}) => {
  await openProjects(page, "&item=pong");
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(indicator(page)).toHaveText(/^18 \/ 23\b/);
  await expect(inFront(page)).toHaveAttribute("data-entry-id", "pong");
  await expect(entry(page, "pong")).toHaveAttribute("data-selected", "");
});

test("reduced motion jumps instead of turning", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openProjects(page);
  await settle(entry(page, "bash-shell"));

  // One evaluate: a click from Playwright, then a measurement, would let
  // frames pass in between and a spring would look finished.
  const at = await page.evaluate(async () => {
    const root = document.querySelector('[data-window-id="projects"]')!;
    const next = root.querySelector<HTMLElement>('[aria-label="Next item"]')!;
    next.click();
    await new Promise<void>((done) => requestAnimationFrame(() => done()));
    const centre = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.x + r.width / 2;
    };
    return {
      item: centre(root.querySelector('[data-entry-id="tetris-asm"]')!),
      stage: centre(root.querySelector("[data-carousel]")!),
    };
  });
  expect(Math.abs(at.item - at.stage)).toBeLessThanOrEqual(2);
  await expect(indicator(page)).toHaveText(/^2 \/ 13\b/);
});

test("the chips rebuild the ring", async ({ page }) => {
  await openProjects(page);

  await chip(page, "Hackathons").click();
  await expect(indicator(page)).toHaveText(/^1 \/ 2\b/);
  await expect(inFront(page)).toHaveAttribute("data-entry-id", "emberhacks");

  await chip(page, "All").click();
  await expect(indicator(page)).toHaveText(/^1 \/ 23\b/);
  await expect(entries(page)).toHaveCount(23);
  await settle(entry(page, "bash-shell"));

  // The widest ring fills the stage with 15 units to spare (#81). Every item
  // lies inside it, so a stage with padding or a narrower stage fails.
  const boxes = await win(page).evaluate((root) => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    return {
      stage: rect(root.querySelector("[data-carousel]")!),
      items: [...root.querySelectorAll("[data-entry-id]")].map(rect),
    };
  });
  expect(boxes.items).toHaveLength(23);
  for (const b of boxes.items) {
    expect(b.left).toBeGreaterThanOrEqual(boxes.stage.left - 1);
    expect(b.right).toBeLessThanOrEqual(boxes.stage.right + 1);
    expect(b.top).toBeGreaterThanOrEqual(boxes.stage.top - 1);
    expect(b.bottom).toBeLessThanOrEqual(boxes.stage.bottom + 1);
  }
});
