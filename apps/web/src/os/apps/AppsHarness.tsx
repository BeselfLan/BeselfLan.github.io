"use client";

import { useEffect } from "react";
import { Screen } from "../screen/Screen";
import { os } from "../store";
import { WindowLayer } from "../window/WindowLayer";
import { appLookup, chromeOf, gridApps, renderContent } from "./registry";

/**
 * Used only by the dev-only /e2e-apps/ route (#53 explains why it never
 * ships). It runs the real registry in a Screen with a launcher of its own, so
 * the kernel test of the Hello app (open, drag, minimise, restore, close) does
 * not depend on the desktop, which #16 replaces. There is no boot, no deep link
 * and no URL sync, so the route's URL never changes.
 */
export function AppsHarness() {
  // A plain effect: it must run after Screen's layout effects.
  useEffect(() => {
    os.windows.setAppLookup(appLookup);
  }, []);
  return (
    <div className="fixed inset-0">
      <Screen>
        <div data-testid="apps-harness" className="absolute inset-0 bg-os-dark">
          <nav
            aria-label="Harness launcher"
            className="absolute top-12 right-4 flex flex-col gap-2"
          >
            {gridApps.map((app) => (
              <button
                key={app.id}
                type="button"
                className="rounded-os-sm bg-white/10 px-3 py-1"
                onClick={() => {
                  os.windows.openApp(app.id);
                }}
              >
                {`Open ${app.name}`}
              </button>
            ))}
          </nav>
        </div>
        <WindowLayer chromeOf={chromeOf} renderContent={renderContent} />
      </Screen>
    </div>
  );
}
