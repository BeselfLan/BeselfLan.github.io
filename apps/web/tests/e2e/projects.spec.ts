import { expect, test, type Locator, type Page } from "@playwright/test";

// The Projects window in Chromium: the chips, the count, the selection and the
// entry icons (#82), the 3D ring with its buttons and clicks (#94), its wheel,
// drag and keys (#95), and the detail panel with Play (#117).

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

// The wheel, the drag and the keys (#95). The mouse is driven at measured
// client coordinates: a moving ring fails Playwright's "stable" check, so
// nothing here clicks an item while the ring turns. Positions are read only
// after settleRotation, because the ring springs after every input.

const THETA = 360 / 13;

// The ring's rotation, from the `rotateY` of its inline transform.
async function ringRotation(page: Page): Promise<number> {
  return ring(page).evaluate((el) => {
    const found = /rotateY\((-?[\d.]+)deg\)/.exec(
      (el as HTMLElement).style.transform,
    );
    if (found === null) throw new Error("the ring has no rotateY");
    return Number(found[1]);
  });
}

// Polls until two reads 150 ms apart are equal and sit on a whole item, then
// returns the rotation. 150 ms is longer than the wheel's 120 ms idle time, so
// two equal reads cannot both fall in the pause before the snap.
async function settleRotation(page: Page): Promise<number> {
  let before = await ringRotation(page);
  let after = before;
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(150);
        after = await ringRotation(page);
        const same = after === before;
        const onItem =
          Math.abs(after - Math.round(after / THETA) * THETA) < 0.01;
        before = after;
        return same && onItem;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  return after;
}

// The first number of the indicator, "k" of "k / n".
async function frontNumber(page: Page): Promise<number> {
  const text = (await indicator(page).textContent()) ?? "";
  const found = /^(\d+) \//.exec(text);
  if (found === null) throw new Error(`the indicator reads "${text}"`);
  return Number(found[1]);
}

async function centreOf(target: Locator): Promise<{ x: number; y: number }> {
  const box = await settle(target);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Presses at the stage's centre and drags 200 px left in 10 steps. A held drag
// stops for 150 ms before it lets go; a flick lets go while still moving.
async function dragLeft(page: Page, held: boolean) {
  const c = await centreOf(stage(page));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x - 200, c.y, { steps: 10 });
  if (held) await page.waitForTimeout(150);
  await page.mouse.up();
}

test("wheel 3 notches changes the front item", async ({ page }) => {
  await openProjects(page);
  await settle(entry(page, "bash-shell"));
  const c = await centreOf(stage(page));
  await page.mouse.move(c.x, c.y);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 100);

  await settleRotation(page);
  // Wheel-down moves forward. Three notches in one run are 3 / 13, and each
  // notch that settles before the next one arrives makes it 4 / 13.
  expect([3, 4]).toContain(await frontNumber(page));
  const front = await centreOf(inFront(page));
  const frame = await centreOf(stage(page));
  expect(Math.abs(front.x - frame.x)).toBeLessThanOrEqual(2);
});

test("a drag follows the pointer and snaps", async ({ page }) => {
  await openProjects(page);
  await settle(entry(page, "bash-shell"));
  await dragLeft(page, true);

  const rot = await settleRotation(page);
  expect(rot).toBeLessThan(0);
  expect(await frontNumber(page)).toBeGreaterThan(1);
  // The pointer went left and the ring followed it, so the first item is now
  // on the left. C.1's sign would send it right.
  const bash = await centreOf(entry(page, "bash-shell"));
  const frame = await centreOf(stage(page));
  expect(bash.x).toBeLessThan(frame.x);
  await expect(win(page).locator("[data-selected]")).toHaveCount(0);
});

test("a short drag selects nothing", async ({ page }) => {
  await openProjects(page);
  const c = await centreOf(entry(page, "bash-shell"));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x - 20, c.y, { steps: 2 });
  // Held still, so the release has no speed: a 20 px move made in a few
  // milliseconds is a flick, and the ring would coast to the next item.
  await page.waitForTimeout(150);
  await page.mouse.up();

  await settleRotation(page);
  await expect(indicator(page)).toHaveText(/^1 \/ 13\b/);
  // Without the capture at the threshold and the swallow, Chromium clicks the
  // item the press began on.
  await expect(win(page).locator("[data-selected]")).toHaveCount(0);
});

test("a flick carries on", async ({ page }) => {
  await openProjects(page);
  await settle(entry(page, "bash-shell"));
  await dragLeft(page, true);
  const held = await settleRotation(page);

  await dragLeft(page, false);
  const flicked = await settleRotation(page);
  // Both drags are the same length. The second one lets go while moving, so it
  // turns at least one item further than the held one.
  expect(flicked - held).toBeLessThanOrEqual(held - THETA + 0.01);
});

test("the keys step the ring and move focus", async ({ page }) => {
  await openProjects(page);
  await settle(entry(page, "bash-shell"));
  await entry(page, "bash-shell").focus();

  await page.keyboard.press("ArrowRight");
  await expect(indicator(page)).toHaveText(/^2 \/ 13\b/);
  await expect(entry(page, "tetris-asm")).toHaveAttribute("data-front", "");
  await expect(entry(page, "tetris-asm")).toBeFocused();

  await page.keyboard.press("End");
  await expect(indicator(page)).toHaveText(/^13 \/ 13\b/);
  await expect(entry(page, "thornhill-cs-club")).toBeFocused();

  await page.keyboard.press("Home");
  await expect(indicator(page)).toHaveText(/^1 \/ 13\b/);
  await expect(entry(page, "bash-shell")).toBeFocused();
});

// The detail panel and Play (#117). No demo file has to exist: a test that
// opens an entry with a video routes the manifest to a fixture first. Without
// a route the manifest is a 404, which Chromium also logs as a console error,
// and the afterEach above fails. Keep these helpers after the tests above and
// reuse them in the video player's tests (#118).

// Routes only the manifest, by exact path. A glob such as **/media/** would
// also catch /_next/static/media/, where the fonts are.
async function routeManifest(page: Page, json: unknown) {
  await page.route(
    (url) => url.pathname === "/media/manifest.json",
    (route) => route.fulfill({ json }),
  );
}
// The browser skips a source of this type without a request, and the poster is
// the entry's own icon, which exists.
const fixtureEntry = (id: string) => ({
  id,
  sources: [{ src: `${id}.fixture`, type: "video/x-beselfos-fixture" }],
  poster: `/icons/entries/${id}.svg`,
  width: 640,
  height: 360,
  durationMs: 1000,
});
const FIXTURE_MANIFEST = [
  fixtureEntry("deadknight"),
  fixtureEntry("3d-engine"),
];

const panel = (page: Page) => win(page).locator("[data-detail-panel]");
const play = (page: Page) =>
  panel(page).getByRole("button", { name: "Play demo", exact: true });

test("clicking an item opens the panel beside the ring, and a tech chip opens Skills", async ({
  page,
}) => {
  await openProjects(page);
  await settle(entry(page, "tetris-asm"));
  const before = await settle(stage(page));
  await entry(page, "tetris-asm").click();

  await expect(panel(page)).toBeVisible();
  await expect(
    panel(page).getByRole("heading", {
      level: 3,
      name: "Tetris in MIPS Assembly (MARS)",
    }),
  ).toBeVisible();
  // Tetris has no video.
  await expect(play(page)).toHaveCount(0);

  // The panel sits at the left edge of the main area, with the icon above the
  // title. Its slide-in takes 250 ms.
  const box = await settle(panel(page));
  const edge = await panel(page).evaluate((el) => ({
    left: el.getBoundingClientRect().left,
    parent: el.parentElement!.getBoundingClientRect().left,
  }));
  expect(Math.abs(edge.left - edge.parent)).toBeLessThanOrEqual(1);
  const icon = await panel(page).locator("img").boundingBox();
  const title = await panel(page)
    .getByRole("heading", { level: 3 })
    .boundingBox();
  expect(icon).not.toBeNull();
  expect(title).not.toBeNull();
  expect(icon!.y + icon!.height).toBeLessThanOrEqual(title!.y);

  // The ring moved right, and the front item is clear of the panel.
  const after = await settle(stage(page));
  expect(after.x).toBeGreaterThan(before.x);
  await settleRotation(page);
  const front = await settle(inFront(page));
  expect(front.x).toBeGreaterThanOrEqual(box.x + box.width - 1);

  // The chip names the skill and opens Skills at it. "MIPS Assembly" is also
  // in the item's name, so the panel is the scope.
  await panel(page)
    .getByRole("button", { name: "MIPS Assembly", exact: true })
    .click();
  await expect(page.locator('[data-window-id="skills"]')).toBeVisible({
    timeout: 15_000,
  });
});

test("a link to an item lands with the panel open, and the X and Esc close it", async ({
  page,
}) => {
  await openProjects(page, "&item=tetris-asm");
  await expect(
    panel(page).getByRole("heading", {
      level: 3,
      name: "Tetris in MIPS Assembly (MARS)",
    }),
  ).toBeVisible();

  await panel(page).getByRole("button", { name: "Close details" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(win(page).locator("[data-selected]")).toHaveCount(0);
  await expect(inFront(page)).toBeFocused();

  // Clicking the front item opens it again, and Escape closes it. The OS's
  // Escape (close all) skips an Escape that was already handled, so the app must
  // prevent it. React listens on the document, so a listener added to the
  // document now hears the event after the app's handler and before the window,
  // where the OS listens, and notes whether it was prevented by then. (The OS
  // prevents it itself later, so a listener on the window could not tell.)
  await inFront(page).click();
  await expect(panel(page)).toBeVisible();
  await page.evaluate(() => {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.body.dataset.escapePrevented = String(e.defaultPrevented);
      }
    });
  });
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(win(page).locator("[data-selected]")).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute(
    "data-escape-prevented",
    "true",
  );
  await expect(win(page)).toBeVisible();
});

test("Play opens a window whose title contains Demo, and it closes", async ({
  page,
}) => {
  await routeManifest(page, FIXTURE_MANIFEST);
  await openProjects(page, "&item=deadknight");

  // "ready" means the static provider fetched the manifest, parsed it and found
  // the entry in a real browser.
  await expect(play(page)).toHaveAttribute("data-media", "ready", {
    timeout: 15_000,
  });
  await expect(play(page)).toBeEnabled();
  await play(page).click();

  const player = page.locator('[data-window-id="video-player:deadknight"]');
  await expect(player).toBeVisible({ timeout: 15_000 });
  await expect(player.locator("[data-titlebar] h2")).toContainText("Demo");

  await player.getByRole("button", { name: "Close", exact: true }).click();
  await expect(player).toHaveCount(0);
});

test("Play says Demo offline when the media is unavailable", async ({
  page,
}) => {
  await routeManifest(page, []);
  await openProjects(page, "&item=deadknight");

  await expect(play(page)).toHaveAttribute("data-media", "offline", {
    timeout: 15_000,
  });
  await expect(play(page)).toBeDisabled();

  // A disabled button ignores the pointer, so the wrapper around it hears the
  // hover. The tooltip is portaled into the screen, outside the window.
  await play(page).locator("xpath=..").hover();
  await expect(page.getByRole("tooltip")).toHaveText("Demo offline");
});

// The demo window (#118). It reuses the fixture manifest above, so no demo file
// has to exist: the fixture's source type is one the browser rejects without a
// request, which takes the player from loading to ready to error. Real
// playback is the next issue's.

const player = (page: Page, id: string) =>
  page.locator(`[data-window-id="video-player:${id}"]`);

test("the demo window is titled after the entry, with minimise and close, and shows the error with Retry", async ({
  page,
}) => {
  await routeManifest(page, FIXTURE_MANIFEST);
  await openProjects(page, "&item=deadknight");
  await expect(play(page)).toHaveAttribute("data-media", "ready", {
    timeout: 15_000,
  });
  await play(page).click();

  const demo = player(page, "deadknight");
  await expect(demo).toBeVisible({ timeout: 15_000 });
  // The title comes from the args Play sends, not from the id.
  await expect(demo.locator("[data-titlebar] h2")).toHaveText(
    "DeadKnight -- Roguelite Platformer -- Demo",
  );
  await expect(
    demo.getByRole("button", { name: "Minimise", exact: true }),
  ).toBeVisible();
  await expect(
    demo.getByRole("button", { name: "Close", exact: true }),
  ).toBeVisible();
  await expect(
    demo.getByRole("button", { name: "Maximise", exact: true }),
  ).toHaveCount(0);

  // 880 by 540 screen units, whatever the scale.
  const box = await settle(demo);
  const wanted = 880 / 540;
  expect(
    Math.abs(box.width / box.height - wanted) / wanted,
  ).toBeLessThanOrEqual(0.01);

  // Chromium fires `error` on the rejected <source>. It reaches the player
  // only if the <video> mounted with the fixture source.
  const failed = demo.locator('[data-video-state="error"]');
  await expect(failed).toBeVisible({ timeout: 15_000 });
  await expect(failed.getByText("This demo could not load.")).toBeVisible();
  await expect(
    failed.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
});

test("one window per demo, and two demos side by side", async ({ page }) => {
  await routeManifest(page, FIXTURE_MANIFEST);
  await openProjects(page, "&item=deadknight");
  await expect(play(page)).toHaveAttribute("data-media", "ready", {
    timeout: 15_000,
  });
  await play(page).click();

  const first = player(page, "deadknight");
  await expect(first).toBeVisible({ timeout: 15_000 });
  await first.getByRole("button", { name: "Minimise", exact: true }).click();
  await expect(first).toBeHidden();

  // Playing the same demo again raises its window; it does not open a second.
  await play(page).click();
  await expect(first).toHaveCount(1);
  await expect(first).toBeVisible();

  // Another entry gets its own window, next to the first.
  await first.getByRole("button", { name: "Minimise", exact: true }).click();
  await expect(first).toBeHidden();
  await inFront(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(inFront(page)).toHaveAttribute("data-entry-id", "3d-engine");
  await page.keyboard.press("Enter");
  await expect(
    panel(page).getByRole("heading", {
      level: 3,
      name: "3D Software Rasterizer",
    }),
  ).toBeVisible();
  await expect(play(page)).toHaveAttribute("data-media", "ready", {
    timeout: 15_000,
  });
  await play(page).click();

  await expect(player(page, "3d-engine")).toBeVisible({ timeout: 15_000 });
  await expect(player(page, "deadknight")).toHaveCount(1);
  await expect(page.locator('[data-window-id^="video-player:"]')).toHaveCount(
    2,
  );
});
