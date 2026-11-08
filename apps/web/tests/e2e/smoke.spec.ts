import { expect, test } from "@playwright/test";

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
