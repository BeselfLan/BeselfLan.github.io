import { expect, test } from "@playwright/test";

test("placeholder page renders with tokens and fonts, no console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");

  const heading = page.getByRole("heading", { name: /BeselfOS v2/ });
  await expect(heading).toBeVisible();
  await expect(page.locator("main")).toHaveCSS(
    "background-color",
    "rgb(44, 0, 30)",
  );
  await expect(page.locator("body")).toHaveCSS("font-family", /Ubuntu/);
  await expect(heading).toHaveCSS("font-family", /Ubuntu.Mono/);

  const orange = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--os-orange")
      .trim()
      .toLowerCase(),
  );
  expect(orange).toBe("#e95420");

  expect(errors).toEqual([]);
});
