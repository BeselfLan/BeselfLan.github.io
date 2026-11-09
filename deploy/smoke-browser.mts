// The browser half of deploy/smoke-web.sh: a real Chromium opens the site in
// topology (b) and plays a demo through the API, or finds the API gone. Node 24
// runs this file as it is, so it uses only syntax that is erasable (no enum,
// namespace or parameter property). Playwright's own waits do the waiting.
// Usage: node deploy/smoke-browser.mts <online|offline> <siteOrigin> <apiOrigin>
// Exits 2 on a bad call and 1, with SMOKE BROWSER FAIL: <what>, on a failed check.
import { chromium } from "@playwright/test";

const [mode, siteOrigin, apiOrigin] = process.argv.slice(2);
if ((mode !== "online" && mode !== "offline") || !siteOrigin || !apiOrigin) {
  console.error(
    "usage: node deploy/smoke-browser.mts <online|offline> <siteOrigin> <apiOrigin>",
  );
  process.exit(2);
}

interface Violation {
  directive: string;
  blockedURI: string;
}

function fail(what: string): never {
  throw new Error(what);
}

async function main(): Promise<void> {
  // web.localhost is the site's host in the local env file; the stack listens
  // on loopback only.
  const browser = await chromium.launch({
    args: ["--host-resolver-rules=MAP web.localhost 127.0.0.1"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    page.setDefaultTimeout(15_000);
    // Every Content-Security-Policy violation, kept for the checks below.
    await page.addInitScript(() => {
      const found: Violation[] = [];
      Object.assign(window, { __violations: found });
      document.addEventListener("securitypolicyviolation", (event) => {
        found.push({
          directive: event.effectiveDirective,
          blockedURI: event.blockedURI,
        });
      });
    });

    await page.goto(`${siteOrigin}/?app=projects&item=deadknight`);
    const panel = page.locator(
      '[data-window-id="projects"] [data-detail-panel]',
    );
    const play = panel.getByRole("button", { name: "Play demo", exact: true });

    if (mode === "online") {
      // "ready": the page asked the API for the manifest and found the demo.
      await panel.locator('button[data-media="ready"]').waitFor();
      await play.click();
      const video = page.locator(
        '[data-window-id="video-player:deadknight"] video',
      );
      await video.waitFor({ state: "attached" });
      await page.waitForFunction(() => {
        const element = document.querySelector(
          '[data-window-id="video-player:deadknight"] video',
        );
        return element instanceof HTMLVideoElement && element.readyState >= 1;
      });
      // The file came from the API, and not from a copy on the site's own host.
      const source = await video.evaluate(
        (v: HTMLVideoElement) => v.currentSrc,
      );
      if (!source.startsWith(`${apiOrigin}/media/files/`)) {
        fail(
          `the video plays from ${source}, not from ${apiOrigin}/media/files/`,
        );
      }
      // The tray reports the API as reachable, so "offline" below means something.
      await page
        .locator('[data-network-status="online"]')
        .waitFor({ timeout: 10_000 });
      // Zod tries `eval` once and falls back when the policy blocks it. That
      // one report is expected; anything else is a real block.
      const violations = (await page.evaluate(
        () => (window as unknown as { __violations: Violation[] }).__violations,
      )) as Violation[];
      const blocked = violations.filter((v) => v.blockedURI !== "eval");
      if (blocked.length > 0) {
        fail(`the policy blocked ${JSON.stringify(blocked)}`);
      }
    } else {
      await panel.locator('button[data-media="offline"]').waitFor();
      // A disabled button ignores the pointer, so its wrapper hears the hover.
      await play.locator("xpath=..").hover();
      await page
        .getByRole("tooltip")
        .filter({ hasText: "Demo offline" })
        .waitFor();
      await page
        .locator('[data-network-status="offline"]')
        .waitFor({ timeout: 10_000 });
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SMOKE BROWSER FAIL: ${message.split("\n")[0]}`);
  process.exit(1);
});
