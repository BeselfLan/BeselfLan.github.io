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
