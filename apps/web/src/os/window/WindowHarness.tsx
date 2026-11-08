"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Screen } from "@/os/screen/Screen";
import { os } from "@/os/store";
import type { WindowApp } from "@/os/store/windows";
import { WindowLayer, type WindowChrome } from "./WindowLayer";

type HarnessApp = WindowApp & { chrome: WindowChrome };

// Alpha can maximise and Beta cannot. They overlap at (400..600, 250..400),
// and Beta opens second, so it starts on top.
const apps = new Map<string, HarnessApp>([
  [
    "alpha",
    {
      id: "alpha",
      name: "Alpha",
      window: {
        width: 400,
        height: 300,
        initialPosition: { x: 200, y: 100 },
      },
      capabilities: { maximize: true },
      singleton: true,
      chrome: { minimize: true, maximize: true, close: true },
    },
  ],
  [
    "beta",
    {
      id: "beta",
      name: "Beta",
      window: {
        width: 400,
        height: 300,
        initialPosition: { x: 400, y: 250 },
      },
      capabilities: { maximize: false },
      singleton: true,
      chrome: { minimize: true, maximize: false, close: true },
    },
  ],
]);

const chromeOf = (appId: string) => apps.get(appId)?.chrome;

// State that must survive minimise and restore, and go on close.
function Counter() {
  const [n, setN] = useState(0);
  return (
    <button
      type="button"
      className="m-4 rounded-os-sm bg-white/10 px-3 py-1"
      onClick={() => setN((v) => v + 1)}
    >
      {`Pressed ${n}`}
    </button>
  );
}
const renderContent = (): ReactNode => <Counter />;

/** Used only by the dev-only e2e route. */
export function WindowHarness() {
  // A plain effect: it must run after Screen's layout effects. Singletons
  // make the second run under Strict Mode harmless, and Beta still ends on top.
  useEffect(() => {
    os.windows.setAppLookup((id) => apps.get(id));
    os.windows.openApp("alpha");
    os.windows.openApp("beta");
  }, []);
  return (
    <div className="fixed inset-0">
      <Screen>
        <div
          data-testid="harness-desktop"
          className="absolute inset-0 bg-os-dark"
        >
          <button
            type="button"
            className="absolute top-12 right-4 rounded-os-sm bg-white/10 px-3 py-1"
            onClick={() => os.windows.openApp("alpha")}
          >
            Open Alpha
          </button>
        </div>
        <WindowLayer chromeOf={chromeOf} renderContent={renderContent}>
          {/* Inside Beta, clear of the overlap and of both title bars. */}
          <div
            data-testid="harness-overlay"
            className="pointer-events-auto absolute h-10 w-20 rounded-os-sm bg-os-accent"
            style={{ left: 700, top: 480 }}
          />
        </WindowLayer>
      </Screen>
    </div>
  );
}
